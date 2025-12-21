
// This script demonstrates how to call Imagen 4 from a Node.js app (CommonJS style)
// First, install the SDK: npm install @google/genai

require('dotenv').config();
const fs = require('fs');

async function generateImage() {
    try {
        // @google/genai is an ESM package, so we use dynamic import in CommonJS
        const { GoogleGenAI } = await import("@google/genai");

        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        
        console.log("Generating image with Imagen 4...");
        
        const response = await ai.models.generateImages({
            model: "imagen-4.0-generate-001",
            prompt: "A futuristic cyberpunk city with neon lights and flying cars, 8k resolution",
            config: {
                numberOfImages: 1,
                aspectRatio: "16:9",
                addWatermark: true
            },
        });

        const generatedImage = response.generatedImages[0];
        if (generatedImage) {
            const imgBytes = generatedImage.image.imageBytes;
            const buffer = Buffer.from(imgBytes, "base64");
            const fileName = "output_imagen.png";
            fs.writeFileSync(fileName, buffer);
            console.log(`Saved: ${fileName}`);
        } else {
            console.log("No image generated.");
        }

    } catch (error) {
        console.error("Error generating image:", error);
    }
}

generateImage();
