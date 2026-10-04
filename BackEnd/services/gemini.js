const { GoogleGenAI } = require("@google/genai");

const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY
});

// Primary model that was successfully tested with RescueAI
const PRIMARY_MODEL = "gemini-3.5-flash-lite";
const FALLBACK_MODEL = "gemini-3.5-flash-lite";


async function generateReportSafely(prompt, imageData = null) {

    // ==========================================
    // PREPARE GEMINI CONTENT
    // ==========================================

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


    // ==========================================
    // TRY PRIMARY MODEL
    // ==========================================

    try {

        const response = await ai.models.generateContent({
            model: PRIMARY_MODEL,
            contents: contents
        });

        return {
            text: response.text || "",
            needsManualReview: false
        };

    } catch (primaryError) {

        console.warn(
            `Primary model ${PRIMARY_MODEL} failed:`,
            primaryError.message
        );


        // ==========================================
        // TRY FALLBACK MODEL
        // ==========================================

        try {

            console.log(
                `Trying fallback model ${FALLBACK_MODEL}...`
            );

            const response = await ai.models.generateContent({
                model: FALLBACK_MODEL,
                contents: contents
            });

            return {
                text: response.text || "",
                needsManualReview: false
            };

        } catch (fallbackError) {

            console.error(
                `Fallback model ${FALLBACK_MODEL} failed:`,
                fallbackError.message
            );


            // ==========================================
            // SAFE MANUAL REVIEW FALLBACK
            // ==========================================

            return {
                text:
                    "AI report generation is temporarily unavailable. " +
                    "This incident needs manual review.",

                needsManualReview: true
            };

        }

    }

}


module.exports = {
    ai,
    generateReportSafely
};