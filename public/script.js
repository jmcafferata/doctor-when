const app = document.getElementById('app');
const homeScreen = document.getElementById('home-screen');
const startScreen = document.getElementById('start-screen');
const loadingScreen = document.getElementById('loading-screen');
const gameScreen = document.getElementById('game-screen');
const endScreen = document.getElementById('end-screen');
const endHomeBtn = document.getElementById('end-home-btn');
const settingInput = document.getElementById('setting-input');
const startBtn = document.getElementById('start-btn');
const newStoryBtn = document.getElementById('new-story-btn');
const backHomeBtn = document.getElementById('back-home-btn');
const storiesList = document.getElementById('stories-list');
const mainImage = document.getElementById('main-image');
const sceneTextContainer = document.getElementById('scene-text-container');
const optionsContainer = document.getElementById('options-container');
const customInputContainer = document.getElementById('custom-input-container');
const customActionInput = document.getElementById('custom-action-input');
const customActionBtn = document.getElementById('custom-action-btn');
const voiceVolumeSlider = document.getElementById('voice-volume');
const musicVolumeSlider = document.getElementById('music-volume');
const reverbLevelSlider = document.getElementById('reverb-level');
const navHomeBtn = document.getElementById('nav-home-btn');
const navHelpBtn = document.getElementById('nav-help-btn');
const helpOverlay = document.getElementById('help-overlay');
const closeHelpBtn = document.getElementById('close-help-btn');
const imageInput = document.getElementById('image-input');
const uploadImgBtn = document.getElementById('upload-img-btn');
const imagePreview = document.getElementById('image-preview');
const previewImg = document.getElementById('preview-img');
const removeImgBtn = document.getElementById('remove-img-btn');

// Game Screen Image Upload Elements
const gameUploadImgBtn = document.getElementById('game-upload-img-btn');
const gameImageInput = document.getElementById('game-image-input');
const gameImagePreview = document.getElementById('game-image-preview');
const gamePreviewImg = document.getElementById('game-preview-img');
const gameRemoveImgBtn = document.getElementById('game-remove-img-btn');

let history = [];
let currentSceneData = null;
let currentAudio = null;
let currentMusic = null;
let currentMusicSrc = null; // remember current track to avoid restarting it
let storyMusicPath = null; // single track per story
let currentStoryId = null;
let savedStoryData = null;
let currentSceneIndex = 0;
let voiceVolume = 1.0;
let musicVolume = 0.4;
let reverbLevel = 0.3;
let playbackSpeed = 1.0;
let selectedImagesBase64 = [];
let selectedGameImagesBase64 = [];
let sceneGenerationId = 0;

function isReplayMode() {
    return !!savedStoryData;
}

// Helper to switch screens
function showScreen(screen) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    screen.classList.add('active');
}

function stopCurrentAudio() {
    if (currentAudio) {
        currentAudio.pause();
        currentAudio.dispatchEvent(new Event('ended')); // Force promise resolution
        currentAudio = null;
    }
}

function returnToHome() {
    sceneGenerationId++;
    stopCurrentAudio();
    if (currentMusic) {
        currentMusic.pause();
        currentMusic = null;
        currentMusicSrc = null;
        storyMusicPath = null;
    }
    // Reset image upload
    selectedImagesBase64 = [];
    imageInput.value = '';
    imagePreview.style.display = 'none';
    imagePreview.innerHTML = '<button id="remove-img-btn" style="background: none; border: none; color: #ff4444; cursor: pointer; margin-left: 10px;">Borrar Todo</button>';
    document.getElementById('remove-img-btn').addEventListener('click', clearStartImages);
    
    showScreen(homeScreen);
}

// Image Upload Logic
if (uploadImgBtn) {
    uploadImgBtn.addEventListener('click', () => imageInput.click());
}

function clearStartImages() {
    selectedImagesBase64 = [];
    imageInput.value = '';
    imagePreview.style.display = 'none';
    // Re-render empty state
    imagePreview.innerHTML = '<button id="remove-img-btn" style="background: none; border: none; color: #ff4444; cursor: pointer; margin-left: 10px;">Borrar Todo</button>';
    document.getElementById('remove-img-btn').addEventListener('click', clearStartImages);
}

if (imageInput) {
    imageInput.addEventListener('change', async (e) => {
        const files = Array.from(e.target.files);
        if (files.length > 0) {
            // Clear previous if any? Or append? Let's append.
            // Actually, let's clear for simplicity or just add.
            // Let's add.
            
            for (const file of files) {
                const base64 = await readFileAsBase64(file);
                selectedImagesBase64.push(base64);
                
                // Add thumbnail
                const img = document.createElement('img');
                img.src = base64;
                img.style.maxHeight = '100px';
                img.style.borderRadius = '8px';
                img.style.border = '1px solid #fff';
                imagePreview.insertBefore(img, imagePreview.lastElementChild); // Insert before the remove button
            }
            
            imagePreview.style.display = 'flex';
            imagePreview.style.alignItems = 'center';
        }
    });
}

// Initial bind for remove button
if (removeImgBtn) {
    removeImgBtn.addEventListener('click', clearStartImages);
}

// Game Screen Image Upload Logic
if (gameUploadImgBtn) {
    gameUploadImgBtn.addEventListener('click', () => gameImageInput.click());
}

function clearGameImages() {
    selectedGameImagesBase64 = [];
    gameImageInput.value = '';
    gameImagePreview.style.display = 'none';
    gameImagePreview.innerHTML = '<button id="game-remove-img-btn" style="background: none; border: none; color: #ff4444; cursor: pointer; font-weight: bold;">✕</button>';
    document.getElementById('game-remove-img-btn').addEventListener('click', clearGameImages);
}

if (gameImageInput) {
    gameImageInput.addEventListener('change', async (e) => {
        const files = Array.from(e.target.files);
        if (files.length > 0) {
            for (const file of files) {
                const base64 = await readFileAsBase64(file);
                selectedGameImagesBase64.push(base64);
                
                // Add thumbnail
                const img = document.createElement('img');
                img.src = base64;
                img.style.height = '40px';
                img.style.borderRadius = '4px';
                img.style.border = '1px solid #ccc';
                gameImagePreview.insertBefore(img, gameImagePreview.lastElementChild);
            }
            gameImagePreview.style.display = 'flex';
        }
    });
}

if (gameRemoveImgBtn) {
    gameRemoveImgBtn.addEventListener('click', clearGameImages);
}

function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// Navbar Controls
if (navHomeBtn) {
    navHomeBtn.addEventListener('click', () => {
        returnToHome();
    });
}

if (navHelpBtn) {
    navHelpBtn.addEventListener('click', () => {
        if (helpOverlay) helpOverlay.classList.remove('hidden');
    });
}

if (closeHelpBtn) {
    closeHelpBtn.addEventListener('click', () => {
        if (helpOverlay) helpOverlay.classList.add('hidden');
    });
}

if (helpOverlay) {
    helpOverlay.addEventListener('click', (e) => {
        if (e.target === helpOverlay) {
            helpOverlay.classList.add('hidden');
        }
    });
}

// Volume Controls
if (voiceVolumeSlider) {
    voiceVolumeSlider.addEventListener('input', (e) => {
        voiceVolume = parseFloat(e.target.value);
        if (currentAudio) {
            currentAudio.volume = voiceVolume;
        }
    });
}

if (musicVolumeSlider) {
    musicVolumeSlider.addEventListener('input', (e) => {
        musicVolume = parseFloat(e.target.value);
        if (currentMusic) {
            currentMusic.volume = musicVolume; // immediate response to slider
        }
    });
}

if (reverbLevelSlider) {
    reverbLevelSlider.addEventListener('input', (e) => {
        reverbLevel = parseFloat(e.target.value);
    });
}

// Speed Controls
document.querySelectorAll('.speed-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        // Update active state
        document.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        // Update speed
        playbackSpeed = parseFloat(btn.dataset.speed);
        
        // Update current audio if playing
        if (currentAudio) {
            // Base rate is 1.2, so we multiply by playbackSpeed
            currentAudio.playbackRate = 1.2 * playbackSpeed;
        }
    });
});

// Load Stories on Init
async function loadStories() {
    try {
        const res = await fetch('/api/stories');
        const data = await res.json();
        
        // Handle both old array format (just in case) and new object format
        const stories = Array.isArray(data) ? data : (data.stories || []);
        const creatorMode = data.creatorMode !== false; // Default to true if undefined (backward compat)

        if (!creatorMode) {
            if (newStoryBtn) newStoryBtn.style.display = 'none';
        } else {
            if (newStoryBtn) newStoryBtn.style.display = '';
        }
        
        storiesList.innerHTML = '';
        stories.forEach(story => {
            const div = document.createElement('div');
            div.className = 'story-item';
            
            const imageHtml = story.image ? `<img src="${story.image}" class="story-thumbnail" alt="Cover">` : '<div class="story-thumbnail-placeholder"></div>';
            
            div.innerHTML = `
                ${imageHtml}
                <div class="story-info">
                    <span class="story-title">${story.title}</span>
                    <span class="story-meta">${new Date(story.date).toLocaleDateString()} - ${story.scenes} scenes</span>
                </div>
            `;
            
            div.addEventListener('click', async () => {
                try {
                    const res = await fetch(`/stories/${story.id}/story.json`);
                    const data = await res.json();
                    
                    savedStoryData = data;
                    currentStoryId = story.id;
                    storyMusicPath = (data.scenes && data.scenes[0] && data.scenes[0].music) ? data.scenes[0].music : null;
                    currentSceneIndex = 0;
                    history = []; // Reset history for replay context if needed
                    
                    // Load first scene
                    if (savedStoryData.scenes && savedStoryData.scenes.length > 0) {
                        showScreen(loadingScreen);
                        setTimeout(() => {
                            updateGameScreen(savedStoryData.scenes[0]);
                            showScreen(gameScreen);
                        }, 1000);
                    }
                } catch (e) {
                    console.error("Failed to load story:", e);
                    alert("Error al cargar la historia.");
                }
            });
            storiesList.appendChild(div);
        });
    } catch (e) {
        console.error("Failed to load stories", e);
    }
}

// Init
loadStories();

// Navigation
newStoryBtn.addEventListener('click', () => showScreen(startScreen));
backHomeBtn.addEventListener('click', () => returnToHome());

// Start Game
startBtn.addEventListener('click', async () => {
    const setting = settingInput.value.trim();
    if (!setting) return alert('¡Por favor ingresa un escenario!');

    // Initial history
    history = [];
    currentStoryId = null;
    savedStoryData = null;
    storyMusicPath = null;
    currentSceneIndex = 0;
    await loadScene('/api/start', { setting, images: selectedImagesBase64 });
});

async function loadScene(endpoint, body) {
    // Add storyId if exists
    if (currentStoryId) {
        body.storyId = currentStoryId;
    }

    // Kick off generation request first, then show loader spinner
    const fetchPromise = fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    }).then(res => res.json());

    showScreen(loadingScreen);

    try {
        const data = await fetchPromise;
        
        if (data.error) throw new Error(data.error);
        
        currentSceneData = data;
        if (data.storyId) {
            currentStoryId = data.storyId;
        }

        if (!storyMusicPath && data.music) {
            storyMusicPath = data.music;
        }

        updateGameScreen(data);

        if (currentSceneData) {
            // For history, we store the text content, not the full object
            // Prefer the narrated segments; fallback to scene_text if needed
            const segments = Array.isArray(data.narrative?.segments)
                ? data.narrative.segments
                : Array.isArray(data.scene_text)
                    ? data.scene_text
                    : [data.scene_text || ''];
            const fullText = segments.join(' ');
            history.push({ role: 'model', text: fullText });
        }
        
        showScreen(gameScreen);
        
    } catch (error) {
        console.error(error);
        alert('Error generando la historia. Por favor intenta de nuevo.');
        showScreen(startScreen);
    }
}

function updateGameScreen(data) {
    sceneGenerationId++;
    // Reset UI state
    mainImage.classList.remove('visible');
    
    // Force instant opacity reset
    mainImage.style.transition = 'none';
    mainImage.offsetHeight; // Force reflow
    mainImage.style.transition = '';

    sceneTextContainer.innerHTML = ''; // Clear text
    optionsContainer.classList.remove('visible');
    optionsContainer.innerHTML = '';
    customInputContainer.classList.remove('visible');
    customActionInput.value = '';
    // Reset game image upload
    selectedGameImagesBase64 = [];
    if (gameImageInput) gameImageInput.value = '';
    if (gameImagePreview) {
        gameImagePreview.style.display = 'none';
        gameImagePreview.innerHTML = '<button id="game-remove-img-btn" style="background: none; border: none; color: #ff4444; cursor: pointer; font-weight: bold;">✕</button>';
        document.getElementById('game-remove-img-btn').addEventListener('click', clearGameImages);
    }

    if (isReplayMode()) {
        customInputContainer.style.display = 'none';
    } else {
        customInputContainer.style.display = 'flex';
    }
    
    // Handle Music: single track per story. If already known, reuse; else generate once.
    if (!storyMusicPath && data.music) {
        storyMusicPath = data.music;
    }

    if (storyMusicPath) {
        playMusic(storyMusicPath);
    } else if (data.scene_music_style && currentStoryId && (!isReplayMode() || currentSceneIndex === 0)) {
        generateAndPlayMusic(data.scene_music_style, data.scene_music_title, currentStoryId);
    }

    // Set Main Image Source (but keep it hidden)
    if (data.image) {
        mainImage.src = data.image;
    }
    
    // Start Sequence
    playSequence(data);
}

// Helper to play music
function playMusic(musicPath) {
    // Resolve to absolute src string
    const musicSrc = musicPath.startsWith('/') ? musicPath : `data:audio/mpeg;base64,${musicPath}`;

    // If we're already playing this track, do not restart—just glide to the desired volume
    if (currentMusic && currentMusicSrc === musicSrc && !currentMusic.paused) {
        currentMusic.volume = musicVolume;
        return;
    }

    // Swap tracks: fade out old, then start new
    if (currentMusic) {
        const oldMusic = currentMusic;
        fadeOutAudio(oldMusic);
    }
    
    currentMusic = new Audio(musicSrc);
    currentMusicSrc = musicSrc;
    storyMusicPath = musicPath; // persist canonical path
    currentMusic.loop = true;
    currentMusic.volume = musicVolume;
    currentMusic.play().catch(e => console.error("Music play failed:", e));
    // fadeInAudio(currentMusic, musicVolume);
}

// Async Music Generation
async function generateAndPlayMusic(style, title, storyId, attempt = 0) {
    console.log("Requesting background music...");
    try {
        const res = await fetch('/api/music', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ style, title, storyId })
        });
        const data = await res.json();

        if (data.music) {
            console.log("Music received, playing...");
            playMusic(data.music);
            return;
        }

        if (data.pending) {
            const nextAttempt = attempt + 1;
            if (nextAttempt <= 80) { // retry for ~4 min total
                console.log(`Music still pending (task ${data.taskId || 'unknown'}), retry ${nextAttempt}`);
                setTimeout(() => generateAndPlayMusic(style, title, storyId, nextAttempt), 3000);
            } else {
                console.warn("Music generation still pending after retries (~4 min). Giving up.");
            }
        }
    } catch (e) {
        console.error("Background music generation failed", e);
    }
}

function fadeOutAudio(audio) {
    const fadeInterval = setInterval(() => {
        if (audio.volume > 0.05) {
            audio.volume = Math.max(0, audio.volume - 0.05);
        } else {
            audio.volume = 0;
            audio.pause();
            clearInterval(fadeInterval);
        }
    }, 200);
}

function fadeInAudio(audio, targetVolume = musicVolume) {
    const fadeInterval = setInterval(() => {
        if (audio.volume < targetVolume) {
            audio.volume = Math.min(targetVolume, audio.volume + 0.05);
        } else {
            clearInterval(fadeInterval);
        }
    }, 200);
}

function fadeToVolume(audio, targetVolume) {
    const fadeInterval = setInterval(() => {
        if (!audio) {
            clearInterval(fadeInterval);
            return;
        }
        const diff = targetVolume - audio.volume;
        if (Math.abs(diff) <= 0.02) {
            audio.volume = targetVolume;
            clearInterval(fadeInterval);
            return;
        }
        audio.volume = audio.volume + Math.sign(diff) * 0.03;
    }, 150);
}

async function playSequence(data) {
    const currentGenId = sceneGenerationId;
    // 1. Fade in Image (5s)
    requestAnimationFrame(() => {
        mainImage.classList.add('visible');
        mainImage.classList.add('presentation-mode');
    });

    // Wait 5 seconds for the presentation animation
    await wait(5000);
    if (currentGenId !== sceneGenerationId) return;

    // Calms down
    mainImage.classList.remove('presentation-mode');

    // Lower music volume to 0.05 while narration starts
    if (currentMusic) {
        fadeToVolume(currentMusic, 0.05);
    }

    await wait(1000);
    if (currentGenId !== sceneGenerationId) return;

    // 2. Play Narrative Audio Parts Sequentially
    if (data.narrative && data.narrative.parts && data.narrative.parts.length > 0) {
        for (const part of data.narrative.parts) {
            if (currentGenId !== sceneGenerationId) return;
            // Show text
            const span = document.createElement('span');
            span.textContent = part.text + " ";
            span.className = 'fade-in-sentence';
            span.style.animationDuration = (2 / playbackSpeed) + 's'; // Faster fade in for chunks
            sceneTextContainer.appendChild(span);

            // Play audio
            if (part.audio) {
                await playAudioWithEffects(part.audio);
            } else {
                // Fallback delay if no audio
                await wait(Math.max(2000, part.text.length * 50) / playbackSpeed); 
            }
        }
    } else if (data.narrative && data.narrative.audio) {
        // Fallback for old format (single audio)
        const segments = data.narrative.segments || (data.scene_text ? (Array.isArray(data.scene_text) ? data.scene_text : [data.scene_text]) : []);
        
        for (const segment of segments) {
             const span = document.createElement('span');
             span.textContent = segment + " ";
             span.className = 'fade-in-sentence';
             span.style.animationDuration = (4 / playbackSpeed) + 's';
             sceneTextContainer.appendChild(span);
        }
        
        await playAudioWithEffects(data.narrative.audio);

    } else {
        // Text only
        const segments = data.narrative ? data.narrative.segments : (data.scene_text || []);
        for (const segment of segments) {
            if (currentGenId !== sceneGenerationId) return;
            const span = document.createElement('span');
            span.textContent = segment + " ";
            span.className = 'fade-in-sentence';
            span.style.animationDuration = (2 / playbackSpeed) + 's';
            sceneTextContainer.appendChild(span);
            await wait(4000 / playbackSpeed);
        }
    }

    if (currentGenId !== sceneGenerationId) return;

    // 3. Show Options (inject selectedOption during replay)
    const optionsToRender = prepareOptionsForReplay(data);
    
    if (optionsToRender.length === 0) {
        showEndScreen();
    } else {
        showOptions(optionsToRender);
    }
}

async function showEndScreen() {
    // 1. Fade out game screen content
    const gameContent = document.querySelector('#game-screen .scene-container');
    if (gameContent) {
        gameContent.style.transition = 'opacity 1.5s ease-out';
        gameContent.style.opacity = '0';
    }
    
    // Wait for fade out
    await wait(1500);

    // 2. Increase music volume
    if (currentMusic) {
        fadeToVolume(currentMusic, 1.0); 
    }
    
    // 3. Prepare "Continuará..." text animation
    const title = document.querySelector('.epic-title');
    if (title) {
        title.innerHTML = ''; // Clear
        const text = "CONTINUARÁ...";
        text.split('').forEach((char, index) => {
            const span = document.createElement('span');
            span.textContent = char;
            span.className = 'epic-letter';
            span.style.animationDelay = `${index * 0.2}s`; // Staggered delay
            title.appendChild(span);
        });
    }

    // 4. Show screen
    showScreen(endScreen);
    
    // Reset game screen opacity for next time
    if (gameContent) {
        setTimeout(() => {
            gameContent.style.opacity = '';
            gameContent.style.transition = '';
        }, 100);
    }
}

if (endHomeBtn) {
    endHomeBtn.addEventListener('click', () => returnToHome());
}

function createReverb(audioContext) {
    const sampleRate = audioContext.sampleRate;
    const length = sampleRate * 1.5; // 1.5s reverb tail
    const impulse = audioContext.createBuffer(2, length, sampleRate);
    const left = impulse.getChannelData(0);
    const right = impulse.getChannelData(1);

    for (let i = 0; i < length; i++) {
        const n = i;
        // Simple exponential decay noise
        const val = (Math.random() * 2 - 1) * Math.pow(1 - n / length, 3);
        left[i] = val;
        right[i] = val;
    }

    const convolver = audioContext.createConvolver();
    convolver.buffer = impulse;
    return convolver;
}

async function playAudioWithEffects(audioUrl) {
    if (!audioUrl) return;
    
    const audioSrc = audioUrl.startsWith('/') ? audioUrl : `data:audio/mpeg;base64,${audioUrl}`;
    const audio = new Audio(audioSrc);
    audio.crossOrigin = "anonymous";
        // Ensure max volume
    audio.volume = 1.0;
        // Lower pitch by slowing down (approx 1 tone down)
    audio.preservesPitch = false;
    audio.playbackRate = 1.2 * playbackSpeed; 
    
    currentAudio = audio;

    const AudioContext = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioContext();
    const source = ctx.createMediaElementSource(audio);
    
    const convolver = createReverb(ctx);
    const wetGain = ctx.createGain();
    wetGain.gain.value = reverbLevel;

    // Dry path
    source.connect(ctx.destination);
    // Wet path
    source.connect(convolver);
    convolver.connect(wetGain);
    wetGain.connect(ctx.destination);

    return new Promise(resolve => {
        audio.onended = () => {
            if (ctx.state !== 'closed') ctx.close();
            resolve();
        };
        audio.onerror = () => {
            console.error("Audio playback error", audioUrl);
            if (ctx.state !== 'closed') ctx.close();
            resolve();
        };
        audio.play().then(() => ctx.resume()).catch(e => {
            console.error("Audio play failed:", e);
            if (ctx.state !== 'closed') ctx.close();
            resolve();
        });
    });
}

async function showOptions(options) {
    const currentGenId = sceneGenerationId;
    optionsContainer.classList.add('visible');
    if (!isReplayMode()) {
        customInputContainer.classList.add('visible');
    }
    
    for (let i = 0; i < options.length; i++) {
        if (currentGenId !== sceneGenerationId) return;
        const option = options[i];
        const card = createOptionCard(option);
        optionsContainer.appendChild(card);
        
        // Trigger reflow
        card.offsetHeight;
        
        // Fade in card
        card.classList.add('visible');
        
        // Play option audio
        if (option.audio) {
            await playOptionAudio(option.audio);
        }
        
        await wait(200);
    }
}

function createOptionCard(option) {
    const card = document.createElement('div');
    card.className = 'option-card';
    
    const text = document.createElement('div');
    text.className = 'option-text';
    text.textContent = option.text;
    
    card.appendChild(text);
    
    card.addEventListener('click', () => handleOptionClick(option));
    
    return card;
}

// Replace one existing option card text/handler with the custom prompt (creator mode)
function replaceOneOptionCard(customText) {
    const cards = optionsContainer.querySelectorAll('.option-card');
    if (!cards.length) return;
    const card = cards[cards.length - 1]; // replace last to preserve layout
    const textNode = card.querySelector('.option-text');
    if (textNode) {
        textNode.textContent = customText;
    }
    card.onclick = () => handleOptionClick({ text: customText });
}

// When replaying a saved story, swap one option with the author’s chosen custom prompt
function prepareOptionsForReplay(data) {
    const opts = Array.isArray(data.options)
        ? data.options.map(o => ({ ...o }))
        : [];

    if (!isReplayMode()) return opts;
    if (!opts.length) return opts;

    if (data.selectedOption) {
        // Check if the selected option matches one of the existing options
        const alreadyExists = opts.some(o => o.text === data.selectedOption);

        // Only replace the third button if it was a custom prompt (not in the original list)
        if (!alreadyExists) {
            const idx = opts.length - 1; // replace last slot to keep count at 3
            const selectedAudio = data.selectedOptionAudio || opts[idx].audio;
            opts[idx] = { ...opts[idx], text: data.selectedOption, audio: selectedAudio };
        }
    }
    return opts;
}

function playOptionAudio(audioPath) {
    return playAudioWithEffects(audioPath);
}

function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function playFeedbackSound(type) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'success') {
        // Nice ding / chime
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
        osc.frequency.exponentialRampToValueAtTime(1046.5, ctx.currentTime + 0.1); // C6
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
        osc.start();
        osc.stop(ctx.currentTime + 0.5);
    } else {
        // Error buzz
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(150, ctx.currentTime);
        osc.frequency.linearRampToValueAtTime(100, ctx.currentTime + 0.2);
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
        osc.start();
        osc.stop(ctx.currentTime + 0.3);
    }
}

async function handleOptionClick(option) {
    // Replay Mode Logic
    if (savedStoryData) {
        const currentScene = savedStoryData.scenes[currentSceneIndex];
        
        if (!currentScene.selectedOption) {
             showEndScreen();
             return;
        }

        // Find the card element that was clicked
        // Since we don't pass the event, we find it by text content
        const cards = Array.from(document.querySelectorAll('.option-card'));
        const card = cards.find(c => c.textContent.trim() === option.text);

        // Check if this was the selected option
        if (currentScene.selectedOption === option.text) {
            // Correct choice
            stopCurrentAudio(); // Stop audio only on success
            if (card) card.classList.add('success');
            playFeedbackSound('success');

            await wait(1000); // Wait for sound/visual

            currentSceneIndex++;
            if (currentSceneIndex < savedStoryData.scenes.length) {
                showScreen(loadingScreen);
                setTimeout(() => {
                    updateGameScreen(savedStoryData.scenes[currentSceneIndex]);
                    showScreen(gameScreen);
                }, 500);
            } else {
                showEndScreen();
            }
        } else {
            // Incorrect choice
            // Do NOT stop audio on error to avoid interrupting the flow
            if (card) {
                card.classList.add('error');
                playFeedbackSound('error');
                setTimeout(() => card.classList.remove('error'), 500);
            } else {
                alert("¡Elección incorrecta! Eso no es lo que sucedió en esta historia.");
            }
        }
        return;
    }

    // 2. The user choice (User)
    stopCurrentAudio();
    history.push({ role: 'user', text: option.text });
    
    await loadScene('/api/next', { history, choice: option.text, images: selectedGameImagesBase64 });
}

// Custom Action Logic
customActionBtn.addEventListener('click', () => handleCustomAction());
customActionInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleCustomAction();
});

async function handleCustomAction() {
    const text = customActionInput.value.trim();
    if (!text && selectedGameImagesBase64.length === 0) return;
    
    // Disable input to prevent double submit
    customActionInput.disabled = true;
    customActionBtn.disabled = true;

    // Stop any playing audio
    stopCurrentAudio();

    // Replay Mode Logic
    if (savedStoryData) {
        const currentScene = savedStoryData.scenes[currentSceneIndex];
        
        if (!currentScene.selectedOption) {
             showEndScreen();
             // Re-enable
             customActionInput.disabled = false;
             customActionBtn.disabled = false;
             return;
        }

        if (currentScene.selectedOption === text) {
             // Correct choice
             playFeedbackSound('success');
             customActionInput.style.borderColor = '#44ff44'; // Green border
             
             await wait(1000);

             currentSceneIndex++;
             if (currentSceneIndex < savedStoryData.scenes.length) {
                 showScreen(loadingScreen);
                 setTimeout(() => {
                     updateGameScreen(savedStoryData.scenes[currentSceneIndex]);
                     showScreen(gameScreen);
                 }, 500);
             } else {
                 showEndScreen();
             }
        } else {
            // Incorrect choice
            playFeedbackSound('error');
            customActionInput.style.borderColor = '#ff4444'; // Red border
            // Shake effect manually or via class if we added one for input
            customActionInput.animate([
                { transform: 'translate3d(-1px, 0, 0)' },
                { transform: 'translate3d(2px, 0, 0)' },
                { transform: 'translate3d(-4px, 0, 0)' },
                { transform: 'translate3d(4px, 0, 0)' },
                { transform: 'translate3d(0, 0, 0)' }
            ], { duration: 500 });

            setTimeout(() => {
                customActionInput.style.borderColor = '#333'; // Reset
            }, 500);
        }
        
        // Re-enable
        customActionInput.disabled = false;
        customActionBtn.disabled = false;
        if (currentScene.selectedOption !== text) {
             // Only clear if incorrect, or maybe keep it? 
             // Usually better to keep it so user can edit.
        } else {
             customActionInput.value = ''; // Clear if correct
        }
        return;
    }
    
    // In creator mode: visually replace one option card with the custom prompt
    if (text) replaceOneOptionCard(text);

    // Add to history
    const choiceText = text || "I show you these images.";
    history.push({ role: 'user', text: choiceText });
    
    await loadScene('/api/next', { history, choice: choiceText, images: selectedGameImagesBase64 });
    
    // Re-enable (though screen will change)
    customActionInput.disabled = false;
    customActionBtn.disabled = false;
}