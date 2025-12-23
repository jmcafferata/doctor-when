require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { GoogleAuth } = require('google-auth-library');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;
const DEFAULT_CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');

// Simple in-memory guard to avoid starting duplicate music tasks per story
const musicInFlight = new Map();

app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(express.static('public'));

// Detect if running in Vercel serverless (read-only filesystem)
const IS_VERCEL = process.env.VERCEL === '1';

// Stories directory path - use /tmp for Vercel, public/stories for local
const STORIES_DIR = IS_VERCEL 
    ? path.join('/tmp', 'stories')
    : path.join(__dirname, 'public', 'stories');

// Helper to ensure directory exists (only called when writing)
function ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

let CREATOR_MODE = !!process.env.GEMINI_API_KEY;
let genAI;
let model;

// Helper to initialize or teardown creator-mode related objects
function enableCreatorMode() {
    if (!process.env.GEMINI_API_KEY) {
        console.warn('Cannot enable creator mode: GEMINI_API_KEY missing');
        return false;
    }
    try {
        genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });
        CREATOR_MODE = true;
        console.log('Creator Mode enabled');
        return true;
    } catch (e) {
        console.error('Failed to initialize GenAI:', e.message);
        return false;
    }
}

function disableCreatorMode() {
    CREATOR_MODE = false;
    genAI = null;
    model = null;
    console.log('Creator Mode disabled');
}

// Note: '/crear' runtime endpoints removed — creator mode is controlled
// by the presence of `GEMINI_API_KEY` in environment variables.

if (CREATOR_MODE) {
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    // Use the model requested by user
    model = genAI.getGenerativeModel({ 
        model: "gemini-3-flash-preview"
    });
} else {
    console.log("Creator Mode disabled: Missing GEMINI_API_KEY");
}

// Load logo for subliminal integration - REMOVED
// const logoPath = path.join(__dirname, 'public', 'toxi media logo.jpg');
// let logoPart = null;
// try {
//     const logoBuffer = fs.readFileSync(logoPath);
//     logoPart = {
//         inlineData: {
//             data: logoBuffer.toString('base64'),
//             mimeType: "image/jpeg"
//         }
//     };
// } catch (e) {
//     console.error("Error loading logo:", e);
// }

const SYSTEM_PROMPT = `
You are an AI Game Master for a visual novel style game. 
Your goal is to generate immersive story segments and choices.
You must output ONLY valid JSON.
The story and options MUST be in Spanish.
Include specific character and setting details in the scene descriptions so that the image generator can always generate the same characters and settings.
Adapt the tone and language and content according to the initial prompt/setting provided by the user. Be educational and descriptive, but concise.
The JSON structure must be:
{
  "title": "A creative title for the story (in Spanish)...",
  "scene_text": ["Segment 1 of the story...", "Segment 2...", "Segment 3..."],
  "scene_image_prompt": "A detailed visual description of the scene for an image generator (in English) that should include as many details relataed to the story and characters as necessary. Every image generation is a one shot, so it wont have previous context, you have to give it. ...",
  "scene_music_style": "Musical style tags (e.g. Dark Ambient, Orchestral, Cyberpunk) (in English and very specific and creative)...",
  "scene_music_title": "A short title for the music track...",
  "options": [
    { "text": "Option 1 action (in Spanish)" },
    { "text": "Option 2 action (in Spanish)" },
    { "text": "Option 3 action (in Spanish)" }
  ]
}
Split the scene_text into 2-4 short, dramatic sentences or phrases for pacing.
Keep descriptions concise but evocative. Image prompts should be descriptive and suitable for a generative AI (keep image prompts in English for better results and be consistent with the story and character descriptions from before).
`;

// --- Music helpers (Suno) -------------------------------------------------
async function startMusicTask(style, title) {
    try {
        console.log(`Generating music: ${title} [${style}]`);
        const generateResponse = await axios.post(
            'https://api.sunoapi.org/api/v1/generate',
            {
                prompt: "", // No lyrics for instrumental
                style: style,
                title: title,
                model: "V4_5ALL",
                customMode: true,
                instrumental: true,
                callBackUrl: "https://example.com/callback"
            },
            {
                headers: {
                    'Authorization': `Bearer ${process.env.SUNO_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        if (!generateResponse.data || !generateResponse.data.data) {
            console.error('Suno API Error: Invalid response structure', generateResponse.data);
            return null;
        }

        const taskId = generateResponse.data.data.taskId;
        console.log(`Music generation started: ${taskId}`);
        return taskId;
    } catch (error) {
        console.error('Error starting music generation:', error.message);
        if (error.response) {
            console.error('Suno API Error Data:', error.response.data);
        }
        return null;
    }
}

async function pollMusicTask(taskId, maxAttempts = 5) {
    let attempts = 0;
    while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        try {
            const statusResponse = await axios.get(
                `https://api.sunoapi.org/api/v1/generate/record-info?taskId=${taskId}`,
                {
                    headers: {
                        'Authorization': `Bearer ${process.env.SUNO_API_KEY}`
                    }
                }
            );

            const data = statusResponse.data && (statusResponse.data.data || statusResponse.data);
            // Log the raw status for debugging
            console.log(`[Suno Poll] task=${taskId} attempt=${attempts + 1}/${maxAttempts} status=${data && data.status}`);

            if (data && (data.status === 'SUCCESS' || data.status === 'FIRST_SUCCESS')) {
                // Try to find an audio URL in the typical fields
                const sunoData = data.response && data.response.sunoData ? data.response.sunoData : (data.records || null);
                if (sunoData && sunoData.length > 0) {
                    const audioUrl = sunoData[0].audioUrl || sunoData[0].url || sunoData[0].downloadUrl || null;
                    if (audioUrl) {
                        return { status: 'SUCCESS', audioUrl };
                    }
                }
                // If status is success but we couldn't extract a URL, return success without url so caller can investigate
                return { status: 'SUCCESS', audioUrl: null, raw: data };
            }
            if (data && (data.status === 'FAILED' || data.status === 'ERROR')) {
                return { status: 'FAILED', raw: data };
            }
        } catch (err) {
            console.error('Error polling music task:', err.message);
            return { status: 'FAILED' };
        }
        attempts++;
    }
    return { status: 'PENDING' };
}

function getMusicStatusPath(storyId) {
    return path.join(STORIES_DIR, storyId, 'music_status.json');
}

async function getExistingMusicPath(storyId) {
    try {
        const storyPath = path.join(STORIES_DIR, storyId, 'story.json');
        if (!fs.existsSync(storyPath)) return null;
        const data = JSON.parse(await fs.promises.readFile(storyPath, 'utf8'));
        const firstSceneWithMusic = (data.scenes || []).find(s => s.music);
        if (!firstSceneWithMusic || !firstSceneWithMusic.music) return null;
        const absolute = path.join(__dirname, 'public', firstSceneWithMusic.music);
        return fs.existsSync(absolute) ? firstSceneWithMusic.music : null;
    } catch (e) {
        console.error('Error checking existing music:', e.message);
        return null;
    }
}

async function saveMusicAndUpdateStory(storyId, musicBuffer, musicLabel) {
    const musicPath = await saveAsset(storyId, musicBuffer, 'mp3', musicLabel);

    // Persist on story.json so future requests short-circuit
    const storyPath = path.join(STORIES_DIR, storyId, 'story.json');
    if (fs.existsSync(storyPath)) {
        try {
            const storyData = JSON.parse(await fs.promises.readFile(storyPath, 'utf8'));
            if (storyData.scenes && storyData.scenes.length > 0) {
                if (!storyData.scenes[0].music) {
                    storyData.scenes[0].music = musicPath;
                    await saveStoryState(storyId, storyData);
                }
            }
        } catch (e) {
            console.error('Error updating story music:', e.message);
        }
    }

    return musicPath;
}

// --- Speech sanitization (numbers -> words, strip symbols) -----------------
const DIGIT_WORDS_ES = ['cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve'];

function numberToWordsEs(n) {
    n = Math.max(0, Math.min(999999, Number(n) || 0));
    const unidades = ['','uno','dos','tres','cuatro','cinco','seis','siete','ocho','nueve'];
    const especiales = ['diez','once','doce','trece','catorce','quince','dieciséis','diecisiete','dieciocho','diecinueve'];
    const decenas = ['','diez','veinte','treinta','cuarenta','cincuenta','sesenta','setenta','ochenta','noventa'];
    const centenas = ['','ciento','doscientos','trescientos','cuatrocientos','quinientos','seiscientos','setecientos','ochocientos','novecientos'];

    function menosDeCien(num) {
        if (num < 10) return unidades[num];
        if (num < 20) return especiales[num - 10];
        const d = Math.floor(num / 10);
        const u = num % 10;
        if (num === 20) return 'veinte';
        if (num > 20 && num < 30) return 'veinti' + unidades[u];
        return decenas[d] + (u ? ' y ' + unidades[u] : '');
    }

    function menosDeMil(num) {
        if (num === 0) return '';
        if (num === 100) return 'cien';
        const c = Math.floor(num / 100);
        const resto = num % 100;
        const cTexto = c ? centenas[c] + (resto ? ' ' : '') : '';
        return cTexto + menosDeCien(resto);
    }

    if (n === 0) return 'cero';
    const miles = Math.floor(n / 1000);
    const resto = n % 1000;
    let partes = [];
    if (miles === 1) {
        partes.push('mil');
    } else if (miles > 1) {
        partes.push(menosDeMil(miles) + ' mil');
    }
    if (resto) partes.push(menosDeMil(resto));
    return partes.join(' ').trim();
}

function unitToWord(unit) {
    const map = {
        mm: 'milímetros', cm: 'centímetros', m: 'metros', km: 'kilómetros',
        mg: 'miligramo', g: 'gramo', kg: 'kilogramo',
        ms: 'milisegundos', s: 'segundos', min: 'minutos', h: 'horas',
        hz: 'hercios', mhz: 'megahercios', ghz: 'gigahercios',
        '%': 'por ciento', usd: 'dólares', $: 'dólares'
    };
    return map[unit.toLowerCase()] || unit;
}

function sanitizeForTTS(text) {
    if (!text) return '';
    // Replace number+unit or bare numbers
    const replaced = text.replace(/(\d+)([a-zA-Z%$]+)?/g, (_, num, unit = '') => {
        const numWords = numberToWordsEs(num);
        const unitWords = unit ? unitToWord(unit) : '';
        return [numWords, unitWords].filter(Boolean).join(' ');
    });
    // Replace any remaining digits individually
    const noDigits = replaced.replace(/\d/g, d => DIGIT_WORDS_ES[Number(d)] || '');
    // Strip leftover symbols (keep basic punctuation and accents)
    const cleaned = noDigits.replace(/[^a-zA-ZÁÉÍÓÚáéíóúñÑüÜ¿¡!?,\.\s]/g, ' ');
    return cleaned.replace(/\s+/g, ' ').trim();
}

async function generateSpeech(text, retries = 3) {
    try {
        const safeText = sanitizeForTTS(text);
        const response = await axios.post(
            `https://api.elevenlabs.io/v1/text-to-speech/${process.env.ELEVENLABS_VOICE_ID}`,
            {
                text: safeText,
                model_id: "eleven_multilingual_v2",
                voice_settings: {
                    stability: 0.5,
                    similarity_boost: 0.5
                }
            },
            {
                headers: {
                    'Accept': 'audio/mpeg',
                    'xi-api-key': process.env.ELEVENLABS_API_KEY,
                    'Content-Type': 'application/json'
                },
                responseType: 'arraybuffer'
            }
        );
        return Buffer.from(response.data).toString('base64');
    } catch (error) {
        if (error.response && error.response.status === 429 && retries > 0) {
            console.log(`Rate limit hit for speech generation. Retrying in 2s... (${retries} attempts left)`);
            await new Promise(resolve => setTimeout(resolve, 2000));
            return generateSpeech(text, retries - 1);
        }
        console.error('Error generating speech:', error.message);
        return null;
    }
}

// Helper to save assets
async function saveAsset(storyId, buffer, extension, type) {
    const filename = `${type}_${Date.now()}.${extension}`;
    const assetsDir = path.join(STORIES_DIR, storyId, 'assets');
    ensureDir(assetsDir);
    const filepath = path.join(assetsDir, filename);
    await fs.promises.writeFile(filepath, buffer);
    return `/stories/${storyId}/assets/${filename}`;
}

// Fetch OAuth token from service account for server-side Imagen calls
async function getServiceAccountToken() {
    try {
        const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS || DEFAULT_CREDENTIALS_PATH;
        if (!fs.existsSync(keyFile)) {
            return null;
        }
        const auth = new GoogleAuth({
            scopes: ['https://www.googleapis.com/auth/generative-language'],
            keyFile
        });
        const client = await auth.getClient();
        const tokenResponse = await client.getAccessToken();
        const token = tokenResponse?.token || tokenResponse;
        return token || null;
    } catch (e) {
        console.error('Error fetching service account token:', e.message);
        return null;
    }
}

// Helper to generate image (Nano Banana / Gemini 3 Pro Image)
async function generateSceneImage(prompt, referenceImageBase64 = null) {
    try {
        console.log("[Image Generation] Prompt:", prompt);
        if (referenceImageBase64) console.log("[Image Generation] Using reference image");

        // Dynamic import for @google/genai
        const { GoogleGenAI } = await import("@google/genai");
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

        const contents = [];
        if (referenceImageBase64) {
            // Extract mime type if present
            let mimeType = "image/png";
            const match = referenceImageBase64.match(/^data:(image\/\w+);base64,/);
            if (match) {
                mimeType = match[1];
            }
            
            // Remove header
            const cleanBase64 = referenceImageBase64.replace(/^data:image\/\w+;base64,/, "");
            
            contents.push({
                inlineData: {
                    mimeType: mimeType,
                    data: cleanBase64
                }
            });
        }
        contents.push({ text: prompt });

        const response = await ai.models.generateContent({
            model: "gemini-3-pro-image-preview", 
            contents: contents,
            config: {
                responseModalities: ["IMAGE"],
                imageConfig: {
                    aspectRatio: "16:9",
                    imageSize: "1K"
                }
            }
        });

        const part = response.candidates && response.candidates[0] && response.candidates[0].content && response.candidates[0].content.parts 
            ? response.candidates[0].content.parts.find(p => p.inlineData) 
            : null;

        if (part && part.inlineData) {
            return Buffer.from(part.inlineData.data, "base64");
        }

        console.error("No image data in Gemini response.");
        throw new Error("Gemini returned no image data");

    } catch (e) {
        console.error("Error generating image with Gemini:", e.message);
        
        // Fallback to Pollinations
        console.log("Falling back to Pollinations...");
        try {
            const seed = Math.floor(Math.random() * 10000);
            // 16:9 aspect ratio (e.g. 1024x576)
            const imageUrl = `https://pollinations.ai/p/${encodeURIComponent(prompt)}?width=1024&height=576&seed=${seed}&nologo=true&model=flux`;
            const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
            return Buffer.from(response.data);
        } catch (fallbackError) {
            console.error("Pollinations fallback failed:", fallbackError.message);
            return null;
        }
    }
}

// Helper to generate narrative parts sequentially
async function generateNarrativeParts(textSegments, storyId) {
    const parts = [];
    for (let i = 0; i < textSegments.length; i++) {
        const segment = textSegments[i];
        // Small delay to be safe with API rate limits
        if (i > 0) await new Promise(resolve => setTimeout(resolve, 100)); 
        
        const audioBase64 = await generateSpeech(segment);
        let audioUrl = null;
        if (audioBase64) {
            const audioBuffer = Buffer.from(audioBase64, 'base64');
            audioUrl = await saveAsset(storyId, audioBuffer, 'mp3', `narrative_part_${Date.now()}_${i}`);
        }
        parts.push({ text: segment, audio: audioUrl });
    }
    return parts;
}

// Helper to save story state
async function saveStoryState(storyId, storyData) {
    const storyDir = path.join(STORIES_DIR, storyId);
    ensureDir(storyDir);
    const filepath = path.join(storyDir, 'story.json');
    await fs.promises.writeFile(filepath, JSON.stringify(storyData, null, 2));
}

app.get('/api/stories', async (req, res) => {
    try {
        const dirs = await fs.promises.readdir(STORIES_DIR);
        const stories = [];
        for (const dir of dirs) {
            try {
                const storyPath = path.join(STORIES_DIR, dir, 'story.json');
                if (fs.existsSync(storyPath)) {
                    const data = JSON.parse(await fs.promises.readFile(storyPath, 'utf8'));
                    stories.push({
                        id: dir,
                        title: data.title || data.setting || "Untitled Story",
                        date: data.createdAt,
                        scenes: data.scenes.length,
                        image: data.scenes && data.scenes.length > 0 ? data.scenes[0].image : null
                    });
                }
            } catch (e) {
                console.error(`Error reading story ${dir}:`, e);
            }
        }
        res.json({
            stories: stories.sort((a, b) => new Date(b.date) - new Date(a.date)),
            creatorMode: CREATOR_MODE
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to list stories' });
    }
});

app.post('/api/start', async (req, res) => {
    if (!CREATOR_MODE) {
        return res.status(403).json({ error: "Creator mode is disabled on this server." });
    }
    try {
        const { setting, images } = req.body; // Expect 'images' array
        const storyId = `${Date.now()}_${setting.substring(0, 20).replace(/[^a-z0-9]/gi, '_')}`;
        const storyDir = path.join(STORIES_DIR, storyId);
        const assetsDir = path.join(storyDir, 'assets');
        
        await fs.promises.mkdir(storyDir, { recursive: true });
        await fs.promises.mkdir(assetsDir, { recursive: true });

        let prompt = `${SYSTEM_PROMPT}
        
        Start a new story with this setting: "${setting}".
        Generate the first scene.`;

        // Combine parts: [prompt]
        const parts = [prompt];

        // Handle uploaded images
        let firstUploadedImagePath = null;
        let firstImageBase64 = null;

        if (images && Array.isArray(images) && images.length > 0) {
            try {
                for (let i = 0; i < images.length; i++) {
                    const imgBase64 = images[i];
                    // Remove header (e.g., "data:image/jpeg;base64,")
                    const base64Data = imgBase64.replace(/^data:image\/\w+;base64,/, "");
                    const buffer = Buffer.from(base64Data, 'base64');
                    
                    // Save as asset immediately
                    const savedPath = await saveAsset(storyId, buffer, 'jpg', `uploaded_scene_${i}`);
                    if (i === 0) {
                        firstUploadedImagePath = savedPath;
                        firstImageBase64 = imgBase64;
                    }
                    
                    // Add to prompt for multimodal generation
                    parts.push({
                        inlineData: {
                            data: base64Data,
                            mimeType: "image/jpeg"
                        }
                    });
                }
                
                prompt += "\n(Use the attached images as the visual context for the first scene. IMPORTANT: Generate a 'scene_image_prompt' that describes these images in detail, capturing their style, characters, and setting, BUT ADAPTED TO THE STORY. The image prompt should reflect the current scene and events while maintaining the visual style and character appearance of the uploaded images. Make the prompt detailed and high quality.)";
                console.log(`[Gemini Prompt /api/start] ${images.length} images attached`);
            } catch (e) {
                console.error("Error processing uploaded images:", e);
            }
        }

        console.log("[Gemini Prompt /api/start]", prompt);

        const result = await model.generateContent(parts);
        const response = await result.response;
        const text = response.text();
        
        // Clean up markdown code blocks if present
        const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
        const data = JSON.parse(jsonStr);
        
        // Generate Assets
        const assets = {};

        // 1. Image
        // Always generate a scene image, using the first uploaded image as reference if available
        const imageBuffer = await generateSceneImage(data.scene_image_prompt, firstImageBase64); 
        if (imageBuffer) {
            assets.image = await saveAsset(storyId, imageBuffer, 'jpg', 'scene');
        } else if (firstUploadedImagePath) {
             // Fallback to the raw uploaded image if generation fails
             assets.image = firstUploadedImagePath;
        }

        // 2. Music - MOVED TO SEPARATE ENDPOINT FOR ASYNC LOADING
        /*
        const musicUrl = await generateMusic(
            data.scene_music_style || "Ambient mystery", 
            data.scene_music_title || "Mystery Scene"
        );
        if (musicUrl) {
            // Download music to save it locally
            try {
                const musicBuffer = (await axios.get(musicUrl, { responseType: 'arraybuffer' })).data;
                assets.music = await saveAsset(storyId, musicBuffer, 'mp3', 'music');
            } catch (e) {
                console.error("Error downloading music:", e);
            }
        }
        */

        // 3. Narrative Audio (Chunks)
        const textSegments = Array.isArray(data.scene_text) ? data.scene_text : [data.scene_text];
        const narrativeParts = await generateNarrativeParts(textSegments, storyId);
        
        // 4. Options Audio
        const optionsWithAudio = [];
        for (let idx = 0; idx < data.options.length; idx++) {
            const opt = data.options[idx];
            const audioBase64 = await generateSpeech(opt.text);
            let audioUrl = null;
            if (audioBase64) {
                const audioBuffer = Buffer.from(audioBase64, 'base64');
                audioUrl = await saveAsset(storyId, audioBuffer, 'mp3', `option_${idx}`);
            }
            opt.audio = audioUrl;
            optionsWithAudio.push(opt);
        }

        data.narrative = {
            parts: narrativeParts
        };
        data.options = optionsWithAudio;
        data.image = assets.image;
        data.music = assets.music;

        // Save Story Data
        const storyData = {
            id: storyId,
            title: data.title || setting,
            setting: setting,
            createdAt: new Date().toISOString(),
            scenes: [data]
        };
        await saveStoryState(storyId, storyData);

        res.json({ ...data, storyId });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Failed to generate story' });
    }
});

app.post('/api/next', async (req, res) => {
    if (!CREATOR_MODE) {
        return res.status(403).json({ error: "Creator mode is disabled on this server." });
    }
    try {
        const { history, choice, storyId, images } = req.body; // Expect 'images' array
        
        // Load existing story to append
        const storyPath = path.join(STORIES_DIR, storyId, 'story.json');
        let storyData = {};
        if (fs.existsSync(storyPath)) {
            storyData = JSON.parse(await fs.promises.readFile(storyPath, 'utf8'));
        }

        // Limit history to last 6 turns to avoid token limits
        const recentHistory = history.slice(-6);

        // Simplified history for the prompt
        let historyText = recentHistory.map(h => `${h.role}: ${h.text}`).join('\n');
        
        let promptText = `${SYSTEM_PROMPT}
        
        Original Setting: "${storyData.setting || 'Unknown'}"

        Story History:
        ${historyText}
        
        The player chose: "${choice}".
        Continue the story based on this choice.`;

        const parts = [promptText];

        let firstUploadedImagePath = null;
        let firstImageBase64 = null;

        if (images && Array.isArray(images) && images.length > 0) {
            try {
                for (let i = 0; i < images.length; i++) {
                    const imgBase64 = images[i];
                    // Remove header
                    const base64Data = imgBase64.replace(/^data:image\/\w+;base64,/, "");
                    const buffer = Buffer.from(base64Data, 'base64');
                    
                    // Save as asset
                    const savedPath = await saveAsset(storyId, buffer, 'jpg', `uploaded_next_${Date.now()}_${i}`);
                    if (i === 0) {
                        firstUploadedImagePath = savedPath;
                        firstImageBase64 = imgBase64;
                    }
                    
                    parts.push({
                        inlineData: {
                            data: base64Data,
                            mimeType: "image/jpeg"
                        }
                    });
                }
                
                parts.push({ text: "\n(Use the attached images as visual context for this new scene. IMPORTANT: Generate a 'scene_image_prompt' that describes these images in detail, BUT ADAPTED TO THE STORY. The image prompt should reflect the current scene and events while maintaining the visual style and character appearance of the uploaded images.)" });
                
                console.log(`[Gemini Prompt /api/next] ${images.length} images attached`);
            } catch (e) {
                console.error("Error processing uploaded images in next:", e);
            }
        }

        console.log("[Gemini Prompt /api/next]", promptText);

        const result = await model.generateContent(parts);
        const response = await result.response;
        const text = response.text();
        
        const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
        const data = JSON.parse(jsonStr);
        
        // Generate Assets
        const assets = {};

        // 1. Image
        const imageBuffer = await generateSceneImage(data.scene_image_prompt, firstImageBase64);
        if (imageBuffer) {
            assets.image = await saveAsset(storyId, imageBuffer, 'jpg', 'scene');
        } else if (firstUploadedImagePath) {
             assets.image = firstUploadedImagePath;
        }

        // 2. Music (Disabled for subsequent scenes - one music per adventure)
        /*
        const musicUrl = await generateMusic(
            data.scene_music_style || "Ambient mystery", 
            data.scene_music_title || "Mystery Scene"
        );
        if (musicUrl) {
             try {
                const musicBuffer = (await axios.get(musicUrl, { responseType: 'arraybuffer' })).data;
                assets.music = await saveAsset(storyId, musicBuffer, 'mp3', 'music');
            } catch (e) {
                console.error("Error downloading music:", e);
            }
        }
        */

        // 3. Narrative Audio (Chunks)
        const textSegments = Array.isArray(data.scene_text) ? data.scene_text : [data.scene_text];
        const narrativeParts = await generateNarrativeParts(textSegments, storyId);
        
        // 4. Options Audio
        const optionsWithAudio = [];
        for (let idx = 0; idx < data.options.length; idx++) {
            const opt = data.options[idx];
            const audioBase64 = await generateSpeech(opt.text);
            let audioUrl = null;
            if (audioBase64) {
                const audioBuffer = Buffer.from(audioBase64, 'base64');
                audioUrl = await saveAsset(storyId, audioBuffer, 'mp3', `option_${Date.now()}_${idx}`);
            }
            opt.audio = audioUrl;
            optionsWithAudio.push(opt);
        }

        data.narrative = {
            parts: narrativeParts
        };
        data.options = optionsWithAudio;
        data.image = assets.image;
        data.music = assets.music;

        // Append to story data
        if (storyData.scenes) {
            // Save the choice that led to the new scene in the PREVIOUS scene
            if (storyData.scenes.length > 0) {
                storyData.scenes[storyData.scenes.length - 1].selectedOption = choice;
                // Persist audio for custom prompts so replay mode can play them too
                const prevScene = storyData.scenes[storyData.scenes.length - 1];
                let selectedOptionAudio = null;

                if (Array.isArray(prevScene.options)) {
                    const matched = prevScene.options.find(o => o.text === choice);
                    selectedOptionAudio = matched && matched.audio ? matched.audio : null;
                }

                if (!selectedOptionAudio) {
                    try {
                        const selectedAudioBase64 = await generateSpeech(choice);
                        if (selectedAudioBase64) {
                            const selectedAudioBuffer = Buffer.from(selectedAudioBase64, 'base64');
                            selectedOptionAudio = await saveAsset(
                                storyId,
                                selectedAudioBuffer,
                                'mp3',
                                `selected_option_${Date.now()}`
                            );
                        }
                    } catch (e) {
                        console.error('Error generating audio for selected option:', e.message);
                    }
                }

                if (selectedOptionAudio) {
                    prevScene.selectedOptionAudio = selectedOptionAudio;
                }
            }
            
            storyData.scenes.push(data);
            await saveStoryState(storyId, storyData);
        }

        res.json(data);
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Failed to generate next scene' });
    }
});

app.post('/api/music', async (req, res) => {
    if (!CREATOR_MODE) {
        return res.status(403).json({ error: "Creator mode is disabled on this server." });
    }
    try {
        const { style, title, storyId } = req.body;

        if (!storyId) {
            return res.status(400).json({ error: 'storyId is required' });
        }

        // If there is an in-flight task for this story, reuse it
        if (musicInFlight.has(storyId)) {
            const existingTaskId = musicInFlight.get(storyId);
            return res.json({ pending: true, taskId: existingTaskId });
        }

        // 1) If a track already exists for this story, reuse it
        const existingMusic = await getExistingMusicPath(storyId);
        if (existingMusic) {
            return res.json({ music: existingMusic });
        }

        // 2) Read status (taskId / cached music)
        const statusPath = getMusicStatusPath(storyId);
        let status = {};
        if (fs.existsSync(statusPath)) {
            try {
                status = JSON.parse(await fs.promises.readFile(statusPath, 'utf8'));
            } catch (e) {
                console.error('Error reading music status:', e.message);
            }
        }

        // If we already saved music, return it
        if (status.musicPath) {
            const abs = path.join(__dirname, 'public', status.musicPath);
            if (fs.existsSync(abs)) {
                return res.json({ music: status.musicPath });
            }
        }

        // 3) If there is an existing taskId, poll it instead of creating a new one
        if (status.taskId) {
            // Increase attempts to give the music task more time to finalize on the provider side.
            // Client already retries long-term; here we try a longer poll to reduce round-trips.
            const result = await pollMusicTask(status.taskId, 30);
            if (result.status === 'SUCCESS' && result.audioUrl) {
                try {
                    const musicBuffer = (await axios.get(result.audioUrl, { responseType: 'arraybuffer' })).data;
                    const musicPath = await saveMusicAndUpdateStory(storyId, musicBuffer, `music_${Date.now()}`);
                    const statusDir = path.join(STORIES_DIR, storyId);
                    ensureDir(statusDir);
                    await fs.promises.writeFile(statusPath, JSON.stringify({ taskId: status.taskId, musicPath }, null, 2));
                    musicInFlight.delete(storyId);
                    return res.json({ music: musicPath });
                } catch (e) {
                    console.error('Error downloading finalized music:', e.message);
                    musicInFlight.delete(storyId);
                    return res.status(500).json({ error: 'Failed to download generated music' });
                }
            }

            if (result.status === 'FAILED') {
                musicInFlight.delete(storyId);
                return res.status(500).json({ error: 'Music generation failed. Please retry.', raw: result.raw || null });
            }

            // If we received SUCCESS but no audioUrl, include raw info for debugging
            if (result.status === 'SUCCESS' && !result.audioUrl) {
                return res.status(202).json({ pending: true, taskId: status.taskId, info: result.raw || null });
            }

            return res.json({ pending: true, taskId: status.taskId });
        }

        // 4) No existing task or music: start a new one and store the taskId
        musicInFlight.set(storyId, 'starting'); // reserve slot to avoid parallel starts
        const taskId = await startMusicTask(
            style || "Ambient mystery",
            title || "Mystery Scene"
        );

        if (!taskId) {
            musicInFlight.delete(storyId);
            return res.status(500).json({ error: 'Failed to start music generation' });
        }

        musicInFlight.set(storyId, taskId);
        const statusDir = path.join(STORIES_DIR, storyId);
        ensureDir(statusDir);
        await fs.promises.writeFile(statusPath, JSON.stringify({ taskId }, null, 2));
        return res.json({ pending: true, taskId });
    } catch (error) {
        console.error('Error generating music:', error);
        if (req.body && req.body.storyId) {
            musicInFlight.delete(req.body.storyId);
        }
        res.status(500).json({ error: 'Failed to generate music' });
    }
});

// New helper endpoint to inspect suno task status directly for debugging
app.get('/api/music/status', async (req, res) => {
    const taskId = req.query.taskId;
    if (!taskId) return res.status(400).json({ error: 'taskId is required' });
    try {
        const statusResponse = await axios.get(
            `https://api.sunoapi.org/api/v1/generate/record-info?taskId=${taskId}`,
            {
                headers: { 'Authorization': `Bearer ${process.env.SUNO_API_KEY}` }
            }
        );
        return res.json({ raw: statusResponse.data });
    } catch (e) {
        console.error('Error fetching music status:', e.message);
        return res.status(500).json({ error: 'Failed to fetch task status' });
    }
});

app.post('/generate-image', async (req, res) => {
    try {
        const prompt = req.body.prompt;
        if (!prompt) {
            return res.status(400).json({ error: "Prompt is required" });
        }

        // Dynamic import is required for @google/genai in CommonJS
        const { GoogleGenAI } = await import("@google/genai");
        
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        
        const response = await ai.models.generateImages({
            model: "imagen-4.0-generate-001",
            prompt: prompt,
            config: {
                numberOfImages: 1,
                aspectRatio: "16:9",
                imageSize: "1K",
                addWatermark: true
            }
        });

        // Send the base64 image back to the client
        const generatedImage = response.generatedImages[0];
        if (generatedImage) {
            res.json({ 
                image: generatedImage.image.imageBytes,
                mimeType: "image/png"
            });
        } else {
            res.status(500).json({ error: "No image generated" });
        }

    } catch (error) {
        console.error("Error generating image:", error);
        res.status(500).json({ error: error.message });
    }
});

// For local development
if (require.main === module) {
    app.listen(port, () => {
        console.log(`Server running at http://localhost:${port}`);
    });
}

// For Vercel serverless
module.exports = app;
