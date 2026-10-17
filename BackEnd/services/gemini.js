
const { GoogleGenAI } = require("@google/genai");

const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY
});

// Primary model
const PRIMARY_MODEL = "gemini-3.5-flash-lite";

// Different model for fallback
const FALLBACK_MODEL = "gemini-2.5-flash";

async function generateReportSafely(prompt, imageData = null) {
    let contents;

    if (imageData) {
        contents = [
            {
                text: prompt
            },
            {
                inlineData: {
                    mimeType: imageData.mimeType,
                    data: imageData.data
                }
            }
        ];
    } else {
        contents = prompt;
    }

    // Try the primary model
    try {
        const response = await ai.models.generateContent({
            model: PRIMARY_MODEL,
            contents
        });

        const responseText =
            typeof response.text === "string"
                ? response.text
                : "";

        if (!responseText.trim()) {
            throw new Error("Primary model returned an empty response.");
        }

        return {
            text: responseText,
            needsManualReview: false
        };
    } catch (primaryError) {
        console.warn(
            `Primary model ${PRIMARY_MODEL} failed:`,
            primaryError.message
        );
    }

    // Try the different fallback model
    try {
        console.log(
            `Trying fallback model ${FALLBACK_MODEL}...`
        );

        const response = await ai.models.generateContent({
            model: FALLBACK_MODEL,
            contents
        });

        const responseText =
            typeof response.text === "string"
                ? response.text
                : "";

        if (!responseText.trim()) {
            throw new Error("Fallback model returned an empty response.");
        }

        return {
            text: responseText,
            needsManualReview: false
        };
    } catch (fallbackError) {
        console.error(
            `Fallback model ${FALLBACK_MODEL} failed:`,
            fallbackError.message
        );

        return {
            text:
                "AI report generation is temporarily unavailable. " +
                "This incident needs manual review.",
            needsManualReview: true
        };
    }
}

module.exports = {
    ai,
    generateReportSafely
};
