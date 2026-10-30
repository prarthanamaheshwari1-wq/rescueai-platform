const sharp = require("sharp");


/**
 * Automated source verification helper.
 * Gracefully handles unavailable online indices without breaking or making false claims.
 */
/**
 * Searches publicly accessible images using SearchApi.
 * Accepts a public image URL, never a local report file path.
 */
async function verifyImageSource(imageUrl) {
    const unavailable = (message) => ({
        status: "unavailable",
        sourceMatched: false,
        matchedSourceUrl: null,
        matches: [],
        message
    });

    try {
        const apiKey = process.env.SEARCHAPI_API_KEY;

        if (!apiKey) {
            return unavailable("SearchApi API key is not configured.");
        }

        if (
            typeof imageUrl !== "string" ||
            !/^https:\/\//i.test(imageUrl)
        ) {
            return unavailable(
                "A publicly accessible HTTPS image URL is required."
            );
        }

        const params = new URLSearchParams({
            engine: "google_reverse_image",
            url: imageUrl
        });

        const response = await fetch(
            `https://www.searchapi.org/api/v1/search?${params}`,
            {
                headers: {
                    Authorization: `Bearer ${apiKey}`
                },
                signal: AbortSignal.timeout(20000)
            }
        );

        if (!response.ok) {
            return unavailable(
                `SearchApi request failed with HTTP ${response.status}.`
            );
        }

        const data = await response.json();

        const matches = (data.visual_matches || [])
            .filter((item) => {
                try {
                    return (
                        typeof item.link === "string" &&
                        ["http:", "https:"].includes(
                            new URL(item.link).protocol
                        )
                    );
                } catch {
                    return false;
                }
            })
            .slice(0, 10)
            .map((item) => ({
                title: item.title || "Untitled source",
                source: item.source || "Unknown",
                url: item.link
            }));

        return {
            status: matches.length > 0
                ? "matches_found"
                : "no_matches_found",
            sourceMatched: matches.length > 0,
            matchedSourceUrl: matches[0]?.url || null,
            matches,
            message: matches.length > 0
                ? "Visually similar images were found online. Human review is required to determine whether they show the same image or incident."
                : "No visual matches were returned. This does not prove that the image is original or authentic."
        };

    } catch (error) {
        console.error("Source verification error:", error.message);

        return unavailable(
            "External source verification is temporarily unavailable."
        );
    }
}

async function analyzeImageAuthenticity(
    imagePath,
    generateReport
) {
    if (typeof generateReport !== "function") {
        const { generateReportSafely } = require("./gemini");
        generateReport = generateReportSafely;
    }

    const inconclusiveResult = (message) => ({
        status: "inconclusive",
        message,
        prediction: "UNCERTAIN",
        confidence: null,
        manualReviewRequired: true,


        sourceVerification: {
            status: "unavailable",
            sourceMatched: false,
            message:
                "Online source verification was not performed. " +
                "Visual screening alone cannot establish image provenance."
        }
    });

    if (!imagePath) {
        return inconclusiveResult(
            "No image was provided. Manual review is required."
        );
    }

    try {
        const imageBuffer = await sharp(imagePath)
            .jpeg({ quality: 90 })
            .toBuffer();

        if (!imageBuffer.length) {
            return inconclusiveResult(
                "The image is empty. Manual review is required."
            );
        }

        const prompt = `
You are screening an image submitted as disaster-response evidence.

Assess whether the visible image contains strong signs of AI generation
or image manipulation. This is preliminary visual screening, not forensic
authentication.

Consider:
- Inconsistent geometry, perspective, reflections, or shadows.
- Physically implausible objects or interactions.
- Repeated, distorted, or incoherent fine details.
- Inconsistent textures or structural details.
- Visible editing inconsistencies.

Rules:
- Do not infer authenticity from realism alone.
- Do not label an image FAKE merely because it looks unusual, blurry,
  compressed, low quality, or unfamiliar.
- Do not invent metadata or claim to have performed forensic analysis.
- Choose FAKE only when there are specific, substantial visual indicators.
- Choose REAL only when no strong visual indicators are apparent.
- Choose UNCERTAIN when the evidence is ambiguous or insufficient.
- Even a realistic image may be AI-generated; visual inspection cannot
  establish provenance.

Return exactly these three lines:
VERDICT: REAL, FAKE, or UNCERTAIN
REASON: Brief explanation based only on visible evidence.
LIMITATION: Preliminary visual screening only; authenticity is unverified.
`;

        const result = await generateReport(prompt, {
            mimeType: "image/jpeg",
            data: imageBuffer.toString("base64")
        });

        if (
            !result ||
            result.needsManualReview ||
            typeof result.text !== "string"
        ) {
            return inconclusiveResult(
                "AI screening was unavailable. Manual review is required."
            );
        }


        const text = result.text;
        console.log("[Image Authenticity] Gemini response:", text);

        const verdictMatches = [
            ...text.matchAll(
                /^\s*VERDICT\s*:\s*(REAL|FAKE|UNCERTAIN)\s*$/gim
            )
        ];

        if (verdictMatches.length !== 1) {
            return inconclusiveResult(
                "The AI returned an unclear verdict. Manual review is required."
            );
        }

        const verdict = verdictMatches[0][1].toUpperCase();

        const reasonMatch = text.match(
            /^\s*REASON\s*:\s*(.+?)\s*$/im
        );

        const reason = reasonMatch
            ? reasonMatch[1].trim()
            : "No explanation was provided.";


        if (verdict === "FAKE") {
            return {
                status: "possible_ai_generated",
                message:
                    `${reason} ` +
                    "This is a preliminary assessment, not proof of manipulation.",
                prediction: "FAKE",
                confidence: null,
                manualReviewRequired: true,
                sourceVerification: {
                    status: "suspicious_provenance",
                    sourceMatched: false,
                    message: "Image provenance could not be verified against external online databases. Preliminary visual indicators suggest potential artificial generation or tampering."
                }
            };
        }

        if (verdict === "UNCERTAIN") {
            return inconclusiveResult(
                `${reason} Manual review is required.`
            );
        }

        return {
            status: "no_strong_ai_indicators",
            message:
                `${reason} ` +
                "No strong AI indicators were identified, but authenticity " +
                "is not verified. Human review is required before treating " +
                "this image as confirmed evidence.",
            prediction: "REAL",
            confidence: null,
            manualReviewRequired: true,
            sourceVerification: {
                status: "unverified_source",
                sourceMatched: false,
                message: "Automated online source verification is not yet available. The image has been visually screened but not cross-referenced against external web archives."
            }
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
    verifyImageSource,
    analyzeImageAuthenticity
};
