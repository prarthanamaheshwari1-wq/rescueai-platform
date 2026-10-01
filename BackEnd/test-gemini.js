require("dotenv").config();

const { GoogleGenAI } = require("@google/genai");

const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY
});

async function testGemini() {
    try {

        const response = await ai.models.generateContent({
            model: "gemini-3.5-flash-lite",
            contents: "Reply with exactly: RescueAI Gemini Lite connection successful."
        });

        console.log("Gemini Response:");
        console.log(response.text);

    } catch (error) {

        console.error("Gemini Test Failed:");
        console.error(error.message);

    }
}

testGemini();