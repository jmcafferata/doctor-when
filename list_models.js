const axios = require('axios');
require('dotenv').config();

async function listModels() {
    try {
        const response = await axios.get(
            `https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`
        );
        console.log("Available Models:");
        response.data.models.forEach(model => {
            console.log(`- ${model.name} (${model.supportedGenerationMethods})`);
        });
    } catch (error) {
        console.error('Error listing models:', error.response ? error.response.data : error.message);
    }
}

listModels();