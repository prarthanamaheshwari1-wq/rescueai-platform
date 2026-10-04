require("dotenv").config();

const fs = require("fs");
const { GoogleGenAI } = require("@google/genai");

const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY
});

async function testImageAnalysis() {
    try {

        const imagePath = "./test-image.png";

        if (!fs.existsSync(imagePath)) {
            console.log("ERROR: test-image.png not found.");
            return;
        }

        const imageData =
            fs.readFileSync(imagePath).toString("base64");

        const response = await ai.models.generateContent({
            model: "gemini-3.5-flash-lite",
            contents: [
                {
                    text:
                        "Analyze this disaster image. " +
                        "Describe what you can see and identify " +
                        "any visible emergency situation."
                },
                {
                    inlineData: {
                        mimeType: "image/png",
                        data: imageData
                    }
                }
            ]
        });

        console.log("Gemini Image Analysis:");
        console.log(response.text);

    } catch (error) {

        console.error("Gemini Image Test Failed:");
        console.error(error.message);

    }
}

testImageAnalysis();