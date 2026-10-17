const sharp = require('sharp');
const fs = require("fs/promises");
const path = require("path");
const { generateReportSafely } = require("./gemini");

function getMimeType(imagePath) {
    const extension = path.extname(imagePath).toLowerCase();

    const mimeTypes = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".webp": "image/webp"
    };

    return mimeTypes[extension] || null;
}

async function analyzeImageAuthenticity(imagePath) {
    const inconclusiveResult = (message) => ({
        status: "inconclusive",
        message,
        prediction: null,
        confidence: null,
        manualReviewRequired: true
    });

    if (!imagePath) {
        return inconclusiveResult("No image was provided.");
    }

    try {
        // Sharp ki madad se kisi bhi format ki image ko standard JPEG buffer mein convert kar lein
        const imageBuffer = await sharp(imagePath)
            .jpeg({ quality: 90 }) // Kisi bhi format ko automatically JPEG bana dega
            .toBuffer();

        const mimeType = "image/jpeg"; // Ab sabhi images JPEG ban chuki hain

        if (imageBuffer.length === 0) {
            return inconclusiveResult(
                "The image file is empty. Manual review is required."
            );
        }

        const prompt = `
You are performing a preliminary image-authenticity screening
for a disaster-response platform.

Examine the supplied image for visual signs that it may be
AI-generated or manipulated.

Important limitations:
- Visual inspection cannot prove that an image is genuine.
- Do not assume an image is AI-generated merely because it
  looks unusual, compressed, blurry, or edited.
- If the evidence is insufficient, choose UNCERTAIN.
- Do not invent metadata, provenance, or forensic evidence.

Return exactly these three lines:
VERDICT: REAL, FAKE, or UNCERTAIN
REASON: A brief explanation based only on visible evidence.
LIMITATION: This is a preliminary AI assessment, not proof.
`;

        const result = await generateReportSafely(prompt, {
            mimeType,
            data: imageBuffer.toString("base64")
        });

        if (!result || result.needsManualReview || !result.text) {
            return inconclusiveResult(
                "The AI assessment was unavailable. Manual review is required."
            );
        }

        // Flexible matching to handle markdown stars (**VERDICT:**) or extra spaces
        const verdictMatch = result.text.match(
            /VERDICT\s*[:*_-]*\s*(REAL|FAKE|UNCERTAIN)/i
        );

        const reasonMatch = result.text.match(
            /REASON\s*[:*_-]*\s*([^\n]+)/i
        );

        if (!verdictMatch) {
            return inconclusiveResult(
                "The AI returned an unclear assessment. Manual review is required."
            );
        }

        const verdict = verdictMatch[1].toUpperCase();
        const reason = reasonMatch
            ? reasonMatch[1].trim().replace(/[*_]/g, "")
            : "No reliable explanation was returned.";

        let status = "no_strong_ai_indicators";
        let prediction = "REAL";
        let manualReviewRequired = false;

        if (verdict === "FAKE") {
            status = "possible_ai_generated";
            prediction = "FAKE";
            manualReviewRequired = true; // Sirf FAKE hone par hi manual review maangega
        } else if (verdict === "UNCERTAIN") {
            status = "inconclusive";
            prediction = "UNCERTAIN";
            manualReviewRequired = true; // Sirf UNCERTAIN hone par review maangega
        } else {
            // Jab verdict REAL hoga
            status = "no_strong_ai_indicators";
            prediction = "REAL";
            manualReviewRequired = false; // REAL hone par manual review false rahega taaki webpage par clear status dikhe
        }

        return {
            status,
            message:
                `${reason} ` +
                "This preliminary assessment does not establish authenticity.",
            prediction,
            confidence: null,
            manualReviewRequired
        };

    } catch (error) {
        console.error(
            "Image authenticity screening failed:",
            error.message
        );

        return inconclusiveResult(
            "Image authenticity could not be assessed. Manual review is required."
        );
    }
}

module.exports = {
    analyzeImageAuthenticity
};