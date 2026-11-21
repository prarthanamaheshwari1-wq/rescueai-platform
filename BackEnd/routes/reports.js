const express = require("express");
console.log("REPORTS.JS LOADED");

const router = express.Router();
const { sql } = require("../config/db");
const { authenticateToken, authorizeRoles } = require("../middleware/auth");
const { checkIncidentConsistency } = require("../services/incidentConsistency");
const { checkLocationConsistency } = require("../services/locationConsistency");

const upload = require("../middleware/upload");
const fs = require("fs");
const path = require("path");

const { generateReportSafely } = require("../services/gemini");
const { processDisasterImage } = require("../services/imageProcessor");
const {
    analyzeImageAuthenticity,
    verifyImageSource,
    matchSocialNetworkingSite
} = require("../services/imageAuthenticity");
const { checkImageDuplicate } = require("../services/imageDuplicateDetection");
const { crossCheckDisasterSource } = require("../services/disasterCrossCheck");


// ==========================================
// BACKGROUND CHRONOLOGICAL BACKFILL FOR DUPLICATES
// ==========================================
async function runInitialDuplicateBackfill() {
    try {
        const request = new sql.Request();
        const result = await request.query(`
            SELECT IR.Report_id, IR.Photo_Path
            FROM Incident_Reports IR
            LEFT JOIN dbo.Image_Duplicate_Checks DC
                ON DC.Report_id = IR.Report_id
            WHERE IR.Photo_Path IS NOT NULL
                AND (
                    DC.Report_id IS NULL
                    OR DC.Perceptual_Hash IS NULL
                )
            ORDER BY IR.Report_id ASC
        `);

        if (result.recordset.length === 0) return;

        console.log(`[Duplicate Backfill] Processing ${result.recordset.length} historical reports...`);

        let processed = 0;
        let failed = 0;
        let skipped = 0;

        for (const report of result.recordset) {
            const possiblePath = fs.existsSync(report.Photo_Path)
                ? report.Photo_Path
                : path.join(__dirname, "..", report.Photo_Path);

            if (!fs.existsSync(possiblePath)) {
                skipped++;
                console.warn(`[Duplicate Backfill] Image missing for Report #${report.Report_id}`);
                continue;
            }

            try {
                await checkImageDuplicate(possiblePath, report.Report_id);
                processed++;
            } catch (err) {
                failed++;
                console.error(`[Duplicate Backfill] Failed for Report #${report.Report_id}:`, err.message);
            }
        }
        console.log("[Duplicate Backfill] Finished:", {
            total: result.recordset.length,
            processed,
            failed,
            skipped
        });
    } catch (err) {
        console.error("[Duplicate Backfill Error]:", err.message);
    }
}

// Trigger backfill shortly after server boots up
setTimeout(runInitialDuplicateBackfill, 3000);

// ==========================================
// SAFE DELETE FILE (OneDrive & Windows EBUSY Safe)
// ==========================================

const safeDeleteFile = (filePath) => {
    if (!filePath || !fs.existsSync(filePath)) return;

    // Use setImmediate to let the HTTP response finish first
    setImmediate(async () => {
        try {
            await fs.promises.unlink(filePath);
        } catch (err) {
            // If Windows/OneDrive has the file locked (EBUSY/EPERM), 
            // ignore it gracefully so it doesn't clutter your terminal. 
            // Windows will release and clean it up automatically later.
            if (err.code !== 'EBUSY' && err.code !== 'EPERM' && err.code !== 'EACCES') {
                console.error(`Failed to clean up file at ${filePath}:`, err.message);
            }
        }
    });
};

// ==========================================
// CREATE EMERGENCY REPORT
// PUBLIC ROUTE
// ==========================================

router.post(
    "/emergency",
    upload.single("photo"),
    async (req, res) => {

        console.log("EMERGENCY REPORT ROUTE HIT");

        let processedImagePath = null;
        let reportSaved = false;

        try {

            const {
                title,
                description,
                category,
                locationName,
                latitude,
                longitude
            } = req.body || {};

            // ==========================================
            // INPUT VALIDATION
            // ==========================================


            const requiredFields = {
                title,
                description,
                category,
                locationName
            };

            const missingFields = Object.entries(requiredFields)
                .filter(([key, value]) =>
                    typeof value !== "string" || value.trim().length === 0
                )
                .map(([key]) => key);

            if (missingFields.length > 0 || !req.file) {
                if (req.file) {
                    safeDeleteFile(req.file.path);
                }

                return res.status(400).json({
                    message:
                        "Title, description, category, location, and a mandatory photo are required.",
                    missingFields: [
                        ...missingFields,
                        ...(!req.file ? ["photo"] : [])
                    ]
                });
            }



            // ==========================================
            // VALIDATE LATITUDE AND LONGITUDE
            // ==========================================

            const parsedLatitude = Number(latitude);
            const parsedLongitude = Number(longitude);

            if (
                latitude === undefined ||
                latitude === null ||
                String(latitude).trim() === "" ||
                !Number.isFinite(parsedLatitude) ||
                parsedLatitude < -90 ||
                parsedLatitude > 90
            ) {
                if (req.file) {
                    safeDeleteFile(req.file.path);
                }

                return res.status(400).json({
                    message: "Valid latitude is required."
                });
            }

            if (
                longitude === undefined ||
                longitude === null ||
                String(longitude).trim() === "" ||
                !Number.isFinite(parsedLongitude) ||
                parsedLongitude < -180 ||
                parsedLongitude > 180
            ) {
                if (req.file) {
                    safeDeleteFile(req.file.path);
                }

                return res.status(400).json({
                    message: "Valid longitude is required."
                });
            }



            // ==========================================
            // PHOTO PROCESSING
            // ==========================================

            let photoPath = null;
            let imageData = null;

            let imageAuthenticity = {
                status: null,
                prediction: null,
                message: null,
                manualReviewRequired: null,
                screenRephoto: {
                    status: "inconclusive",
                    prediction: "UNCERTAIN",
                    message: "Screen rephotograph assessment is unavailable.",
                    manualReviewRequired: true
                }
            };

            let imageSourceVerification = {
                status: "unavailable",
                sourceMatched: false,
                socialMediaDetected: false,
                socialMatches: [],
                manualReviewRequired: true,
                message:
                    "Online reverse-image verification is unavailable because " +
                    "the submitted image is stored privately. No external service " +
                    "has received this image.",
                matchedSourceUrl: null,
                matches: []
            };

            // If a public image URL is explicitly provided for testing/cross-checking, 
            // trigger SearchApi securely without exposing local private files.
            if (req.body.imageUrl && typeof req.body.imageUrl === "string" && /^https:\/\//i.test(req.body.imageUrl)) {
                try {
                    console.log("[Image Source Verification] Checking public image URL:", req.body.imageUrl);
                    imageSourceVerification = await verifyImageSource(req.body.imageUrl);
                } catch (verifyErr) {
                    console.error("[Image Source Verification Error]:", verifyErr.message);
                    imageSourceVerification = {
                        status: "unavailable",
                        message: "External source verification timed out or failed.",
                        matchedSourceUrl: null,
                        matches: []
                    };
                }
            }

            // ==========================================
            // TRUSTED DISASTER & WEATHER CROSS-CHECKING
            // ==========================================

            let disasterCrossCheck = {
                status: "unavailable",
                sourceName: "External Disaster & Weather Feeds",
                sourceUrl: null,
                matchedAlert: null,
                message: "External cross-checking has not been performed.",
                timestamp: new Date().toISOString()
            };

            try {
                disasterCrossCheck = await crossCheckDisasterSource({
                    category,
                    locationName,
                    latitude: parsedLatitude,
                    longitude: parsedLongitude
                });
            } catch (crossCheckError) {
                console.error("Disaster Cross-Check Integration Error:", crossCheckError.message);
            }

            if (req.file) {

                photoPath =
                    `uploads/${req.file.filename}`;


                processedImagePath =
                    await processDisasterImage(
                        req.file.path
                    );


                if (
                    !processedImagePath ||
                    !fs.existsSync(processedImagePath)
                ) {

                    safeDeleteFile(req.file.path);

                    return res.status(400).json({

                        message:
                            "Image processing failed."

                    });

                }


                const processedImage =
                    fs.readFileSync(
                        processedImagePath
                    );


                imageData = {

                    mimeType: "image/jpeg",

                    data:
                        processedImage.toString(
                            "base64"
                        )

                };
                // ==========================================
                // PRELIMINARY IMAGE-AUTHENTICITY SCREENING
                // ==========================================

                const authenticityResult = await analyzeImageAuthenticity(
                    req.file.path
                );

                imageAuthenticity = {
                    ...authenticityResult,
                    screenRephoto: authenticityResult.screenRephoto || {
                        status: "inconclusive",
                        prediction: "UNCERTAIN",
                        message: "Screen rephotograph assessment is unavailable.",
                        manualReviewRequired: true
                    }
                };

            }


            // ==========================================
            // INSERT EMERGENCY REPORT
            // ==========================================

            const request =
                new sql.Request();


            request.input(
                "Title",
                sql.NVarChar,
                title.trim()
            );


            request.input(
                "Description",
                sql.NVarChar,
                description.trim()
            );


            request.input(
                "Category",
                sql.NVarChar,
                category.trim()
            );

            request.input(
                "LocationName",
                sql.NVarChar,
                locationName.trim()
            );


            request.input(
                "Latitude",
                sql.Decimal(10, 6),
                parsedLatitude
            );


            request.input(
                "Longitude",
                sql.Decimal(10, 6),
                parsedLongitude
            );


            request.input(
                "PhotoPath",
                sql.NVarChar(500),
                photoPath
            );


            // ==========================================
            // CREATE REPORT
            // ==========================================

            const insertResult =
                await request.query(`

                    INSERT INTO Incident_Reports
                    (
                        User_id,
                        Disaster_id,
                        Title,
                        Description,
                        Category,
                        Severity,
                        Priority,
                        Location_Name,
                        Latitude,
                        Longitude,
                        Status,
                        Photo_Path
                    )

                    OUTPUT INSERTED.Report_id

                    VALUES
                    (
                        NULL,
                        NULL,
                        @Title,
                        @Description,
                        @Category,
                        'Medium',
                        'Pending',
                        @LocationName,
                        @Latitude,
                        @Longitude,
                        'Submitted',
                        @PhotoPath
                    )

                `);


            const reportId =
                insertResult.recordset[0]?.Report_id;

            if (reportId) {
                reportSaved = true;
            }


            if (!reportId) {

                safeDeleteFile(req.file?.path);
                safeDeleteFile(processedImagePath);

                return res.status(500).json({

                    message:
                        "Report was created but Report ID could not be generated."

                });

            }


            // ==========================================
            // AUTOMATIC IMAGE DUPLICATE DETECTION
            // ==========================================

            let imageDuplicate = {
                checkCompleted: false,
                isPossibleDuplicate: false,
                similarReportId: null,
                hammingDistance: null,
                checkFailed: false
            };

            try {
                imageDuplicate = {
                    ...imageDuplicate,
                    ...await checkImageDuplicate(
                        req.file.path,
                        reportId
                    )
                };
            } catch (duplicateError) {
                // A duplicate-check failure must not block
                // an otherwise valid emergency report.
                imageDuplicate.checkFailed = true;

                console.error("Image Duplicate Detection Error:", duplicateError.stack || duplicateError);
            }

            // ==========================================
            // AI ANALYSIS DEFAULT VALUES
            // ==========================================

            let aiCategory = category;

            // Safe fallback values if Gemini fails or returns
            // invalid severity or priority values.
            let aiSeverity = null;
            let aiPriority = null;
            let classificationValid = false;

            let aiSummary = "";
            let aiVisualFindings = "";
            let aiRecommendation = "";
            let misinformationScore = 0;

            // ==========================================
            // MISINFORMATION DETECTION
            // ==========================================

            const suspiciousWords = [
                "alien",
                "ufo",
                "zombie",
                "fake",
                "hoax",
                "entire city destroyed",
                "10000 people died",
                "apocalypse",
                "end of world"
            ];

            const reportText =
                `${title} ${description}`.toLowerCase();

            suspiciousWords.forEach(word => {
                if (reportText.includes(word)) {
                    misinformationScore += 20;
                }
            });

            if (misinformationScore > 100) {
                misinformationScore = 100;
            }


            // ==========================================
            // GEMINI PROMPT
            // ==========================================

            const prompt = `
You are RescueAI, an AI disaster-response assistant.

Analyze the emergency using BOTH:
1. The incident title and description.
2. The uploaded disaster image and its visible evidence.

INCIDENT INFORMATION:

Title: ${title}
Description: ${description}
Category: ${category}
Location: ${locationName}

SEVERITY ASSESSMENT:

Determine severity independently. Do not ask the user to select it.

Use exactly one of these values:
- Low: Minor incident, limited danger, little or no visible damage.
- Medium: Significant incident requiring assistance, with a manageable level of danger.
- High: Serious danger, substantial damage, or a major threat to people or infrastructure.
- Critical: Immediate life-threatening danger, catastrophic damage, or an emergency requiring the most urgent response.

PRIORITY ASSESSMENT:

Determine response priority independently using the incident description and image.

Use exactly one of these values:
- Low: Routine response; no indication of immediate danger.
- Moderate: Timely response is needed, but no clear evidence of immediate critical danger.
- High: Urgent response is needed because of significant danger or potential harm.
- Critical: Immediate emergency intervention may be needed to protect lives.

Assess severity and priority separately. Consider the description, visible hazards, apparent damage, and uncertainty. Do not infer casualties or damage that cannot be supported by the evidence.

IMAGE ANALYSIS REQUIREMENTS:

- Analyze the uploaded image carefully.
- Identify visible hazards, damage, affected people, vehicles, buildings, and infrastructure when reasonably observable.
- Distinguish image observations from information supplied in the description.
- Do not invent casualties, damage, rescue activity, or hazards.
- If the evidence is insufficient, state that limitation and make the most cautious reasonable assessment.
- Never invent or change the reported location or category.

RETURN YOUR RESPONSE IN THIS EXACT FORMAT:

SEVERITY: <Low, Medium, High, or Critical>
PRIORITY: <Low, Moderate, High, or Critical>

SUMMARY:
<2-3 sentences summarizing the incident and supporting evidence>

VISUAL_FINDINGS:
<Concise findings supported by the uploaded image, or No image evidence available.>

RECOMMENDATION:
<2-4 practical emergency-response actions appropriate to the assessment>

Return the SEVERITY and PRIORITY labels explicitly.
Do not omit either label.
Do not return multiple alternative values.
`;


            try {
                const {
                    text: aiText,
                    needsManualReview
                } = await generateReportSafely(prompt, imageData);

                const safeAiText =
                    typeof aiText === "string" ? aiText : "";

                if (needsManualReview || !safeAiText.trim()) {
                    aiSummary =
                        safeAiText ||
                        "AI analysis unavailable. Incident requires manual review.";

                    aiVisualFindings =
                        "No reliable image analysis available.";

                    aiRecommendation =
                        "Verify the incident and follow standard emergency response procedures.";
                } else {
                    // Extract AI-determined severity.
                    const severityMatch = safeAiText.match(
                        /^\s*\**\s*SEVERITY\s*\**\s*:\s*\**\s*(Low|Medium|High|Critical)\b/im
                    );

                    // Extract AI-determined priority.
                    const priorityMatch = safeAiText.match(
                        /^\s*\**\s*PRIORITY\s*\**\s*:\s*\**\s*(Low|Moderate|High|Critical)\b/im
                    );

                    const severityMap = {
                        low: "Low",
                        medium: "Medium",
                        high: "High",
                        critical: "Critical"
                    };

                    const priorityMap = {
                        low: "Low",
                        moderate: "Moderate",
                        high: "High",
                        critical: "Critical"
                    };

                    const severityValue = severityMatch?.[1]?.toLowerCase();
                    const priorityValue = priorityMatch?.[1]?.toLowerCase();

                    if (
                        severityValue &&
                        priorityValue &&
                        severityMap[severityValue] &&
                        priorityMap[priorityValue]
                    ) {
                        aiSeverity = severityMap[severityValue];
                        aiPriority = priorityMap[priorityValue];
                        classificationValid = true;
                    }

                    // Extract summary.
                    const summaryMatch = safeAiText.match(
                        /(?:SUMMARY|\*\*SUMMARY\*\*)\s*:\s*([\s\S]*?)(?=(?:VISUAL_FINDINGS|\*\*VISUAL_FINDINGS\*\*)\s*:|(?:RECOMMENDATION|\*\*RECOMMENDATION\*\*)\s*:|$)/i
                    );

                    // Extract visual findings.
                    const visualFindingsMatch = safeAiText.match(
                        /(?:VISUAL_FINDINGS|\*\*VISUAL_FINDINGS\*\*)\s*:\s*([\s\S]*?)(?=(?:RECOMMENDATION|\*\*RECOMMENDATION\*\*)\s*:|$)/i
                    );

                    // Extract recommendation.
                    const recommendationMatch = safeAiText.match(
                        /(?:RECOMMENDATION|\*\*RECOMMENDATION\*\*)\s*:\s*([\s\S]*)/i
                    );

                    aiSummary = summaryMatch
                        ? summaryMatch[1].trim()
                        : "AI analysis generated successfully.";

                    aiVisualFindings = visualFindingsMatch
                        ? visualFindingsMatch[1].trim()
                        : "No image evidence available.";

                    aiRecommendation = recommendationMatch
                        ? recommendationMatch[1].trim()
                        : "Follow standard emergency response procedures.";
                }
            } catch (aiError) {
                console.error(
                    "Gemini AI Analysis Error:",
                    aiError.message
                );

                aiSummary =
                    "AI analysis unavailable. Incident requires manual review.";

                aiVisualFindings =
                    "No reliable image analysis available.";

                aiRecommendation =
                    "Verify the incident and follow standard emergency response procedures.";
            }

            if (!classificationValid) {
                aiSummary =
                    "AI severity or priority could not be validated. Manual review is required.";
            }


            // ==========================================
            // INCIDENT AND LOCATION CONSISTENCY CHECK
            // ==========================================


            const incidentConsistency = checkIncidentConsistency({
                category,
                description,
                locationName,
                latitude: parsedLatitude,
                longitude: parsedLongitude,
                aiVisualFindings
            });

            const locationConsistency = await checkLocationConsistency({
                locationName,
                latitude: parsedLatitude,
                longitude: parsedLongitude
            });

            if (!locationConsistency.checked || !locationConsistency.consistent) {
                incidentConsistency.reviewRecommended = true;

                incidentConsistency.warnings.push({
                    type: "LOCATION_CONSISTENCY",
                    message: locationConsistency.message
                });
            }



            if (classificationValid) {
                const severityUpdateRequest = new sql.Request();

                severityUpdateRequest.input(
                    "ReportId",
                    sql.Int,
                    reportId
                );

                severityUpdateRequest.input(
                    "AISeverity",
                    sql.NVarChar,
                    aiSeverity
                );

                severityUpdateRequest.input(
                    "AIPriority",
                    sql.NVarChar,
                    aiPriority
                );

                await severityUpdateRequest.query(`
                    UPDATE Incident_Reports
                    SET
                    Severity = @AISeverity,
                    Priority = @AIPriority
                    WHERE Report_id = @ReportId
                `);
            }





            // ==========================================
            // SAVE AI ANALYSIS
            // ==========================================

            const aiRequest =
                new sql.Request();


            aiRequest.input(
                "ReportId",
                sql.Int,
                reportId
            );


            aiRequest.input(
                "AICategory",
                sql.NVarChar,
                aiCategory
            );


            aiRequest.input(
                "AISeverity",
                sql.NVarChar,
                aiSeverity
            );


            aiRequest.input(
                "AIPriority",
                sql.NVarChar,
                aiPriority
            );


            aiRequest.input(
                "MIScore",
                sql.Decimal(5, 2),
                misinformationScore
            );


            aiRequest.input(
                "AISummary",
                sql.NVarChar,
                aiSummary
            );


            aiRequest.input(
                "AIVisualFindings",
                sql.NVarChar,
                aiVisualFindings
            );


            aiRequest.input(
                "AIRecommendation",
                sql.NVarChar,
                aiRecommendation
            );

            aiRequest.input(
                "ImageAuthenticityStatus",
                sql.NVarChar(50),
                imageAuthenticity.status
            );

            aiRequest.input(
                "ImageAuthenticityPrediction",
                sql.NVarChar(20),
                imageAuthenticity.prediction
            );

            aiRequest.input(
                "ImageAuthenticityReason",
                sql.NVarChar(sql.MAX),
                imageAuthenticity.message
            );

            aiRequest.input(
                "ImageAuthenticityManualReview",
                sql.Bit,
                imageAuthenticity.manualReviewRequired
            );

            const screenRephoto = imageAuthenticity.screenRephoto || {
                status: "inconclusive",
                prediction: "UNCERTAIN",
                message: "Screen rephotograph assessment is unavailable.",
                manualReviewRequired: true
            };

            aiRequest.input(
                "ImageScreenRephotoStatus",
                sql.NVarChar(50),
                screenRephoto.status
            );

            aiRequest.input(
                "ImageScreenRephotoPrediction",
                sql.NVarChar(20),
                screenRephoto.prediction
            );

            aiRequest.input(
                "ImageScreenRephotoReason",
                sql.NVarChar(sql.MAX),
                screenRephoto.message
            );

            aiRequest.input(
                "ImageScreenRephotoManualReview",
                sql.Bit,
                screenRephoto.manualReviewRequired
            );

            aiRequest.input(
                "ImageSourceStatus",
                sql.NVarChar(30),
                imageSourceVerification.status
            );

            aiRequest.input(
                "ImageSourceMessage",
                sql.NVarChar(sql.MAX),
                imageSourceVerification.message
            );

            aiRequest.input(
                "ImageSourceMatchedURL",
                sql.NVarChar(sql.MAX),
                imageSourceVerification.matchedSourceUrl
            );

            aiRequest.input(
                "ImageSourceMatches",
                sql.NVarChar(sql.MAX),
                JSON.stringify(imageSourceVerification.matches)
            );

            aiRequest.input(
                "DisasterCrossCheckStatus",
                sql.NVarChar(30),
                disasterCrossCheck.status
            );

            aiRequest.input(
                "DisasterCrossCheckMessage",
                sql.NVarChar(sql.MAX),
                disasterCrossCheck.message
            );

            aiRequest.input(
                "DisasterCrossCheckSource",
                sql.NVarChar(255),
                disasterCrossCheck.sourceName
            );

            console.log("SCREEN REPHOTO SAVE CHECK:", {
                reportId,
                screenRephoto,
                parameters: {
                    status: aiRequest.parameters.ImageScreenRephotoStatus?.value,
                    prediction: aiRequest.parameters.ImageScreenRephotoPrediction?.value,
                    reason: aiRequest.parameters.ImageScreenRephotoReason?.value,
                    manualReview: aiRequest.parameters.ImageScreenRephotoManualReview?.value
                }
            });


            await aiRequest.query(`

                INSERT INTO AI_Analysis
                (
                    Report_id,
                    AI_Category,
                    AI_Severity,
                    AI_Priority,
                    Misinformation_Score,
                    AI_Summary,
                    AI_Visual_Findings,
                    AI_Recommendation,
                    Image_Authenticity_Status,
                    Image_Authenticity_Prediction,
                    Image_Authenticity_Reason,
                    Image_Authenticity_Manual_Review,
                    Image_Screen_Rephoto_Status,
                    Image_Screen_Rephoto_Prediction,
                    Image_Screen_Rephoto_Reason,
                    Image_Screen_Rephoto_Manual_Review,
                    Image_Source_Status,
                    Image_Source_Message,
                    Image_Source_Matched_URL,
                    Image_Source_Matches,
                    Disaster_Cross_Check_Status,
                    Disaster_Cross_Check_Message,
                    Disaster_Cross_Check_Source
                )

                VALUES
                (
                    @ReportId,
                    @AICategory,
                    @AISeverity,
                    @AIPriority,
                    @MIScore,
                    @AISummary,
                    @AIVisualFindings,
                    @AIRecommendation,
                    @ImageAuthenticityStatus,
                    @ImageAuthenticityPrediction,
                    @ImageAuthenticityReason,
                    @ImageAuthenticityManualReview,
                    @ImageScreenRephotoStatus,
                    @ImageScreenRephotoPrediction,
                    @ImageScreenRephotoReason,
                    @ImageScreenRephotoManualReview,
                    @ImageSourceStatus,
                    @ImageSourceMessage,
                    @ImageSourceMatchedURL,
                    @ImageSourceMatches,
                    @DisasterCrossCheckStatus,
                    @DisasterCrossCheckMessage,
                    @DisasterCrossCheckSource
                )

            `);



            // ==========================================
            // CLEANUP TEMPORARY FILES
            // Preserve the original photo as report evidence.
            // ==========================================

            if (
                processedImagePath &&
                processedImagePath !== req.file?.path
            ) {
                safeDeleteFile(processedImagePath);
            }



            // ==========================================
            // SUCCESS RESPONSE
            // ==========================================


            return res.status(201).json({

                message:
                    "Emergency report submitted successfully",

                reportId:
                    reportId,

                photoUploaded:
                    !!req.file,

                incidentConsistency: {
                    reviewRecommended:
                        incidentConsistency.reviewRecommended,

                    warnings:
                        incidentConsistency.warnings
                }

            });


        }
        catch (error) {

            console.error(
                "Emergency Report Error:",
                error
            );



            // ==========================================
            // CLEANUP ON ERROR
            // ==========================================

            // Delete the original upload only if no report was saved.
            if (!reportSaved && req.file) {
                safeDeleteFile(req.file.path);
            }

            // The processed image is temporary and can be deleted.
            if (
                processedImagePath &&
                processedImagePath !== req.file?.path
            ) {
                safeDeleteFile(processedImagePath);
            }



            return res.status(500).json({

                message:
                    "Server Error"

            });

        }

    }
);


// ==========================================
// GET ALL REPORTS
// CURRENTLY PUBLIC
// ==========================================

router.get(
    "/",
    authenticateToken,
    authorizeRoles("authority"),
    async (req, res) => {

        try {

            const request =
                new sql.Request();


            const result =
                await request.query(`

                    SELECT *

                    FROM Incident_Reports

                    ORDER BY Report_id DESC

                `);


            return res.status(200).json(
                result.recordset
            );

        }
        catch (error) {

            console.error(
                "Get Reports Error:",
                error
            );


            return res.status(500).json({

                message:
                    "Server Error"

            });

        }

    }
);


// ==========================================
// GET PENDING REPORTS
// CURRENTLY PUBLIC
// ==========================================

router.get(
    "/pending",
    authenticateToken,
    authorizeRoles("authority"),
    async (req, res) => {

        try {

            const request =
                new sql.Request();


            const result =
                await request.query(`

                    SELECT

                        IR.Report_id,
                        IR.Title,
                        IR.Description,
                        IR.Category,
                        IR.Severity,
                        IR.Location_Name,
                        IR.Status,

                        AI.AI_Category,
                        AI.AI_Severity,
                        AI.AI_Priority,
                        AI.Misinformation_Score,
                        AI.AI_Summary,
                        AI.AI_Visual_Findings,
                        AI.AI_Recommendation

                    FROM Incident_Reports IR

                    LEFT JOIN AI_Analysis AI
                        ON IR.Report_id = AI.Report_id

                    WHERE IR.Status = 'Submitted'

                    ORDER BY IR.Report_id DESC

                `);


            return res.status(200).json(
                result.recordset
            );

        }
        catch (error) {

            console.error(
                "Get Pending Reports Error:",
                error
            );


            return res.status(500).json({

                message:
                    "Server Error"

            });

        }

    }
);


// ==========================================
// VERIFY REPORT
// CURRENTLY WITHOUT AUTH
// TOKEN SECURITY WILL BE ADDED LATER
// ==========================================

router.put(
    "/:reportId/verify",
    authenticateToken,
    authorizeRoles("authority"),
    async (req, res) => {

        try {

            const reportId =
                Number(req.params.reportId);


            if (
                !Number.isInteger(reportId) ||
                reportId <= 0
            ) {

                return res.status(400).json({

                    message:
                        "Invalid report ID."

                });

            }


            const request =
                new sql.Request();


            request.input(
                "ReportId",
                sql.Int,
                reportId
            );


            const result =
                await request.query(`

                    UPDATE Incident_Reports

                    SET Status = 'Verified'

                    WHERE Report_id = @ReportId;

                    SELECT
                        Report_id,
                        Title,
                        Status

                    FROM Incident_Reports

                    WHERE Report_id = @ReportId;

                `);


            if (
                result.recordset.length === 0
            ) {

                return res.status(404).json({

                    message:
                        "Report not found."

                });

            }


            return res.json({

                message:
                    "Report Verified",

                report:
                    result.recordset[0]

            });

        }
        catch (error) {

            console.error(
                "Verify Report Error:",
                error
            );


            return res.status(500).json({

                message:
                    "Server Error"

            });

        }

    }
);


// ==========================================
// REJECT REPORT
// CURRENTLY WITHOUT AUTH
// TOKEN SECURITY WILL BE ADDED LATER
// ==========================================

router.put(
    "/:reportId/reject",
    authenticateToken,
    authorizeRoles("authority"),
    async (req, res) => {

        try {

            const reportId =
                Number(req.params.reportId);


            if (
                !Number.isInteger(reportId) ||
                reportId <= 0
            ) {

                return res.status(400).json({

                    message:
                        "Invalid report ID."

                });

            }


            const request =
                new sql.Request();


            request.input(
                "ReportId",
                sql.Int,
                reportId
            );


            const result =
                await request.query(`

                    UPDATE Incident_Reports

                    SET Status = 'Rejected'

                    WHERE Report_id = @ReportId;

                    SELECT
                        Report_id,
                        Title,
                        Status

                    FROM Incident_Reports

                    WHERE Report_id = @ReportId;

                `);


            if (
                result.recordset.length === 0
            ) {

                return res.status(404).json({

                    message:
                        "Report not found."

                });

            }


            return res.json({

                message:
                    "Report Rejected",

                report:
                    result.recordset[0]

            });

        }
        catch (error) {

            console.error(
                "Reject Report Error:",
                error
            );


            return res.status(500).json({

                message:
                    "Server Error"

            });

        }

    }
);


// ==========================================
// GET RISK SUMMARY
// ==========================================

router.get(
    "/risk-summary",
    async (req, res) => {

        try {

            const request =
                new sql.Request();


            const result =
                await request.query(`

                    SELECT

                        COALESCE(
                            SUM(
                                CASE
                                    WHEN LOWER(
                                        LTRIM(
                                            RTRIM(Severity)
                                        )
                                    ) = 'high'
                                    THEN 1
                                    ELSE 0
                                END
                            ),
                            0
                        ) AS HighRisk,

                        COALESCE(
                            SUM(
                                CASE
                                    WHEN LOWER(
                                        LTRIM(
                                            RTRIM(Severity)
                                        )
                                    ) = 'medium'
                                    THEN 1
                                    ELSE 0
                                END
                            ),
                            0
                        ) AS MediumRisk,

                        COALESCE(
                            SUM(
                                CASE
                                    WHEN LOWER(
                                        LTRIM(
                                            RTRIM(Severity)
                                        )
                                    ) = 'low'
                                    THEN 1
                                    ELSE 0
                                END
                            ),
                            0
                        ) AS LowRisk

                    FROM Incident_Reports

                `);


            return res.status(200).json(
                result.recordset[0]
            );

        }
        catch (error) {

            console.error(
                "Risk Summary Error:",
                error
            );


            return res.status(500).json({

                message:
                    "Server Error"

            });

        }

    }
);


// ==========================================
// PUBLIC REPORT TRACKING
// PUBLIC ROUTE
// ==========================================

router.get(
    "/tracking/:reportId",
    async (req, res) => {

        try {

            const reportId =
                Number(req.params.reportId);


            if (
                !Number.isInteger(reportId) ||
                reportId <= 0
            ) {

                return res.status(400).json({

                    message:
                        "Invalid report ID."

                });

            }


            const request =
                new sql.Request();


            request.input(
                "ReportId",
                sql.Int,
                reportId
            );


            const result =
                await request.query(`

                    SELECT

                        IR.Report_id,
                        IR.Title,
                        IR.Description,
                        IR.Category,
                        IR.Severity,
                        IR.Priority,
                        IR.Status,
                        IR.Location_Name,
                        IR.Latitude,
                        IR.Longitude,
                        IR.Created_At,
                        IR.Photo_Path

                    FROM Incident_Reports IR

                    WHERE IR.Report_id = @ReportId

                `);


            if (
                result.recordset.length === 0
            ) {

                return res.status(404).json({

                    message:
                        "Report not found."

                });

            }


            return res.status(200).json(
                result.recordset[0]
            );

        }
        catch (error) {

            console.error(
                "Public Report Tracking Error:",
                error
            );


            return res.status(500).json({

                message:
                    "Server Error"

            });

        }

    }
);


router.get("/public-feed", async (req, res) => {
    try {
        const request = new sql.Request();

        const result = await request.query(`
            SELECT
                Report_id,
                Title,
                Description,
                Category,
                Severity,
                Priority,
                Status,
                Location_Name,
                Created_At,
                Photo_Path
            FROM Incident_Reports
            WHERE Status <> 'Rejected'
            ORDER BY Report_id DESC
        `);

        return res.status(200).json(result.recordset);
    } catch (error) {
        console.error("Public Disaster Feed Error:", error);
        return res.status(500).json({
            message: "Unable to load public disaster reports."
        });
    }
});



// ==========================================
// GET SINGLE REPORT + AI + RESOURCES + VOLUNTEERS
// ==========================================

router.get("/:reportId", authenticateToken, authorizeRoles("authority"), async (req, res) => {

    try {

        const reportId =
            Number(req.params.reportId);


        if (
            !Number.isInteger(reportId) ||
            reportId <= 0
        ) {

            return res.status(400).json({

                message:
                    "Invalid report ID."

            });

        }


        // ==========================================
        // GET REPORT + AI ANALYSIS
        // ==========================================

        const reportRequest =
            new sql.Request();


        reportRequest.input(
            "ReportId",
            sql.Int,
            reportId
        );


        const reportResult =
            await reportRequest.query(`

                    SELECT

                        IR.Report_id,
                        IR.User_id,
                        IR.Disaster_id,
                        IR.Title,
                        IR.Description,
                        IR.Category,
                        IR.Severity,
                        IR.Priority,
                        IR.Location_Name,
                        IR.Latitude,
                        IR.Longitude,
                        IR.Status,
                        IR.Created_At,
                        IR.Photo_Path,
                        DC.Report_id AS DuplicateCheckReportId,
                        DC.Similar_Report_id,
                        DC.Hamming_Distance,
                        DC.Is_Possible_Duplicate,
                        DC.Perceptual_Hash,
                        DC.Perceptual_Hamming_Distance,
                        DC.Perceptual_Similar_Report_id,

                        AI.AI_Category,
                        AI.AI_Severity,
                        AI.AI_Priority,
                        AI.Misinformation_Score,
                        AI.AI_Summary,
                        AI.AI_Visual_Findings,
                        AI.AI_Recommendation,
                        AI.Analyzed_At,
                        AI.Image_Authenticity_Status,
                        AI.Image_Authenticity_Prediction,
                        AI.Image_Authenticity_Reason,
                        AI.Image_Authenticity_Manual_Review,
                        AI.Image_Screen_Rephoto_Status,
                        AI.Image_Screen_Rephoto_Prediction,
                        AI.Image_Screen_Rephoto_Reason,
                        AI.Image_Screen_Rephoto_Manual_Review,
                        AI.Image_Source_Status,
                        AI.Disaster_Cross_Check_Message,
                        AI.Disaster_Cross_Check_Source

                    FROM Incident_Reports IR

                    LEFT JOIN AI_Analysis AI
                        ON IR.Report_id = AI.Report_id

                    LEFT JOIN dbo.Image_Duplicate_Checks DC
                        ON IR.Report_id = DC.Report_id

                    WHERE IR.Report_id = @ReportId

                `);


        if (
            reportResult.recordset.length === 0
        ) {

            return res.status(404).json({

                message:
                    "Report not found."

            });

        }


        const firstRow =
            reportResult.recordset[0];

        // ==========================================
        // INCIDENT CONSISTENCY CHECK
        // ==========================================

        const incidentConsistency = checkIncidentConsistency({
            category: firstRow.Category,
            description: firstRow.Description,
            locationName: firstRow.Location_Name,
            latitude: firstRow.Latitude,
            longitude: firstRow.Longitude,
            aiVisualFindings: firstRow.AI_Visual_Findings
        });

        const locationConsistency = await checkLocationConsistency({
            locationName: firstRow.Location_Name,
            latitude: firstRow.Latitude,
            longitude: firstRow.Longitude
        });

        if (!locationConsistency.checked || !locationConsistency.consistent) {
            incidentConsistency.reviewRecommended = true;

            incidentConsistency.warnings.push({
                type: "LOCATION_CONSISTENCY",
                message: locationConsistency.message
            });
        }

        // ==========================================
        // BACKFILL DUPLICATE CHECK FOR OLDER REPORTS
        // ==========================================
        const duplicateCheckData = {
            DuplicateCheckReportId: firstRow.DuplicateCheckReportId,
            Similar_Report_id: firstRow.Similar_Report_id,
            Hamming_Distance: firstRow.Hamming_Distance,
            Is_Possible_Duplicate: firstRow.Is_Possible_Duplicate,
            Perceptual_Hash: firstRow.Perceptual_Hash,
            Perceptual_Hamming_Distance: firstRow.Perceptual_Hamming_Distance,
            Perceptual_Similar_Report_id: firstRow.Perceptual_Similar_Report_id
        };

        // ==========================================
        // CHECK AI ANALYSIS
        // ==========================================

        const hasAIAnalysis =
            Boolean(
                firstRow.AI_Summary ||
                firstRow.AI_Category ||
                firstRow.AI_Severity
            );




        // ==========================================
        // CREATE REPORT OBJECT
        // ==========================================

        const reportData = {

            Report_id:
                firstRow.Report_id,

            Title:
                firstRow.Title,

            Description:
                firstRow.Description,

            Category:
                firstRow.Category,

            Severity:
                firstRow.Severity,

            Priority:
                firstRow.Priority,

            Location_Name:
                firstRow.Location_Name,

            Latitude:
                firstRow.Latitude,

            Longitude:
                firstRow.Longitude,

            Status:
                firstRow.Status,

            Created_At:
                firstRow.Created_At,

            Photo_Path:
                firstRow.Photo_Path,

            IncidentConsistency: {
                ReviewRecommended:
                    incidentConsistency.reviewRecommended,
                Warnings:
                    incidentConsistency.warnings
            },

            PossibleDuplicate: {
                CheckCompleted:
                    duplicateCheckData.DuplicateCheckReportId != null,

                IsPossibleDuplicate:
                    Boolean(duplicateCheckData.Is_Possible_Duplicate),

                SimilarReportId:
                    duplicateCheckData.Similar_Report_id ??
                    duplicateCheckData.Perceptual_Similar_Report_id ??
                    null,

                HammingDistance:
                    duplicateCheckData.Hamming_Distance ?? null,

                PerceptualSimilarReportId:
                    duplicateCheckData.Perceptual_Similar_Report_id ?? null,

                PerceptualHammingDistance:
                    duplicateCheckData.Perceptual_Hamming_Distance ?? null,

                PerceptualHashAvailable:
                    Boolean(duplicateCheckData.Perceptual_Hash)
            },

            AI_Analysis: hasAIAnalysis
                ? {
                    Category: firstRow.AI_Category,
                    Severity: firstRow.AI_Severity,
                    Priority: firstRow.AI_Priority,
                    Misinformation_Score: firstRow.Misinformation_Score,
                    Summary: firstRow.AI_Summary,
                    Visual_Findings: firstRow.AI_Visual_Findings,
                    Recommendation: firstRow.AI_Recommendation,
                    Analyzed_At: firstRow.Analyzed_At,

                    Image_Authenticity: {
                        Status: firstRow.Image_Authenticity_Status,
                        Prediction: firstRow.Image_Authenticity_Prediction,
                        Message: firstRow.Image_Authenticity_Reason,
                        Confidence: null,
                        ManualReviewRequired:
                            firstRow.Image_Authenticity_Manual_Review
                    },

                    Image_Screen_Rephoto: {
                        Status: firstRow.Image_Screen_Rephoto_Status,
                        Prediction: firstRow.Image_Screen_Rephoto_Prediction,
                        Message: firstRow.Image_Screen_Rephoto_Reason,
                        ManualReviewRequired:
                            firstRow.Image_Screen_Rephoto_Manual_Review
                    },

                    Image_Source_Verification: (() => {
                        const parsedMatches = firstRow.Image_Source_Matches
                            ? JSON.parse(firstRow.Image_Source_Matches)
                            : [];
                        const socialMatches = parsedMatches
                            .map((m) => {
                                const platform = matchSocialNetworkingSite(m?.url);

                                return platform
                                    ? { ...m, platform }
                                    : null;
                            })
                            .filter(Boolean);
                        return {
                            Status: firstRow.Image_Source_Status,
                            Message: firstRow.Image_Source_Message,
                            MatchedURL: firstRow.Image_Source_Matched_URL,
                            Matches: parsedMatches,
                            SocialMediaDetected: socialMatches.length > 0,
                            SocialMatches: socialMatches,
                            ManualReviewRequired: true
                        };
                    })(),


                    Disaster_Cross_Check: {
                        Status: firstRow.Disaster_Cross_Check_Status,
                        Message: firstRow.Disaster_Cross_Check_Message,
                        Source: firstRow.Disaster_Cross_Check_Source
                    }
                }
                : null,


            Resources: [],

            Volunteers: []

        };


        // ==========================================
        // GET ASSIGNED RESOURCES
        // ==========================================

        const resourceRequest =
            new sql.Request();


        resourceRequest.input(
            "ReportId",
            sql.Int,
            reportId
        );


        const resourceResult =
            await resourceRequest.query(`

                    SELECT

                        RA.Assignment_id,
                        RA.Status AS Assignment_Status,

                        R.Resource_id,
                        R.Resource_Name,
                        R.Resource_Type,
                        R.Quantity,
                        R.Location_Name AS Resource_Location,
                        R.Status AS Resource_Status

                    FROM Resource_Assignments RA

                    INNER JOIN Resources R
                        ON RA.Resource_id =
                           R.Resource_id

                    WHERE RA.Report_id =
                          @ReportId

                    ORDER BY
                        RA.Assignment_id DESC

                `);


        reportData.Resources =
            resourceResult.recordset.map(
                row => ({

                    Assignment_id:
                        row.Assignment_id,

                    Resource_id:
                        row.Resource_id,

                    Resource_Name:
                        row.Resource_Name,

                    Resource_Type:
                        row.Resource_Type,

                    Quantity:
                        row.Quantity,

                    Resource_Location:
                        row.Resource_Location,

                    Resource_Status:
                        row.Resource_Status,

                    Assignment_Status:
                        row.Assignment_Status

                })
            );


        // ==========================================
        // GET ASSIGNED VOLUNTEERS
        // ==========================================

        const volunteerRequest =
            new sql.Request();


        volunteerRequest.input(
            "ReportId",
            sql.Int,
            reportId
        );


        const volunteerResult =
            await volunteerRequest.query(`

                    SELECT

                        VA.Assignment_id,
                        VA.Status AS Assignment_Status,

                        V.Volunteer_id,
                        V.Skills AS Volunteer_Skill,
                        V.Availability AS Volunteer_Status,
                        V.Location_Name AS Volunteer_Location

                    FROM Volunteer_Assignments VA

                    INNER JOIN Volunteers V
                        ON VA.Volunteer_id =
                           V.Volunteer_id

                    WHERE VA.Report_id =
                          @ReportId

                    ORDER BY
                        VA.Assignment_id DESC

                `);


        reportData.Volunteers =
            volunteerResult.recordset.map(
                row => ({

                    Assignment_id:
                        row.Assignment_id,

                    Volunteer_id:
                        row.Volunteer_id,

                    Skill:
                        row.Volunteer_Skill,

                    Status:
                        row.Volunteer_Status,

                    Location:
                        row.Volunteer_Location,

                    Assignment_Status:
                        row.Assignment_Status

                })
            );


        console.log("[pHash API DEBUG]", {
            file: __filename,
            cwd: process.cwd(),
            reportId,
            possibleDuplicate: reportData.PossibleDuplicate
        });


        // ==========================================
        // FINAL RESPONSE
        // ==========================================

        return res.status(200).json(
            reportData
        );

    }
    catch (error) {

        console.error(
            "Get Report Error:",
            error
        );


        return res.status(500).json({

            message:
                "Server Error"

        });

    }

}
);


// ==========================================
// UPDATE REPORT STATUS
// CURRENTLY WITHOUT AUTH
// TOKEN SECURITY WILL BE ADDED LATER
// ==========================================

router.put(
    "/:reportId/status",
    authenticateToken,
    authorizeRoles("authority", "responder"),
    async (req, res) => {

        try {

            console.log(
                "================================="
            );

            console.log(
                "UPDATE STATUS ROUTE HIT"
            );

            console.log(
                "Report ID:",
                req.params.reportId
            );

            console.log(
                "Request Body:",
                req.body
            );

            console.log(
                "Received Status:",
                JSON.stringify(
                    req.body.status
                )
            );

            console.log(
                "================================="
            );


            const reportId =
                Number(req.params.reportId);


            const { status } =
                req.body;


            // ==========================================
            // VALIDATE REPORT ID
            // ==========================================

            if (
                !Number.isInteger(reportId) ||
                reportId <= 0
            ) {

                return res.status(400).json({

                    message:
                        "Invalid report ID."

                });

            }


            // ==========================================
            // VALIDATE STATUS
            // ==========================================

            const allowedStatuses = [

                "Submitted",
                "Verified",
                "Rejected",
                "Resolved"

            ];


            if (
                !allowedStatuses.includes(status)
            ) {

                console.log(
                    "INVALID STATUS RECEIVED:",
                    JSON.stringify(status)
                );


                return res.status(400).json({

                    message:
                        "Invalid report status.",

                    receivedStatus:
                        status,

                    allowedStatuses:
                        allowedStatuses

                });

            }


            // ==========================================
            // CHECK REPORT EXISTS
            // ==========================================

            const request =
                new sql.Request();


            request.input(
                "ReportId",
                sql.Int,
                reportId
            );


            request.input(
                "Status",
                sql.NVarChar,
                status
            );


            const result =
                await request.query(`

                    UPDATE Incident_Reports

                    SET Status = @Status

                    WHERE Report_id = @ReportId;

                    SELECT

                        Report_id,
                        Title,
                        Status

                    FROM Incident_Reports

                    WHERE Report_id = @ReportId;

                `);


            if (
                result.recordset.length === 0
            ) {

                return res.status(404).json({

                    message:
                        "Report not found."

                });

            }




            // ==========================================
            // RESTORE RESOURCE QUANTITY WHEN REPORT CLOSES
            // ==========================================

            if (
                status === "Resolved" ||
                status === "Rejected"
            ) {
                const resourceTransaction = new sql.Transaction();

                try {
                    await resourceTransaction.begin(
                        sql.ISOLATION_LEVEL.SERIALIZABLE
                    );

                    const restoreRequest =
                        new sql.Request(resourceTransaction);

                    restoreRequest.input(
                        "ReportId",
                        sql.Int,
                        reportId
                    );

                    await restoreRequest.query(`
                        UPDATE R
                        SET
                            R.Quantity = R.Quantity + A.ReturnQuantity,
                            R.Status = 'Available'
                        FROM Resources R
                        INNER JOIN (
                            SELECT
                                Resource_id,
                                COUNT(*) AS ReturnQuantity
                            FROM Resource_Assignments
                                WITH (UPDLOCK, HOLDLOCK)
                            WHERE Report_id = @ReportId
                              AND LOWER(LTRIM(RTRIM(Status))) = 'active'
                            GROUP BY Resource_id
                        ) A
                            ON R.Resource_id = A.Resource_id;
                    `);

                    const completeRequest =
                        new sql.Request(resourceTransaction);

                    completeRequest.input(
                        "ReportId",
                        sql.Int,
                        reportId
                    );

                    await completeRequest.query(`
                        UPDATE Resource_Assignments
                        SET Status = 'Completed'
                        WHERE Report_id = @ReportId
                          AND LOWER(LTRIM(RTRIM(Status))) = 'active';
                    `);

                    await resourceTransaction.commit();
                } catch (resourceError) {
                    try {
                        await resourceTransaction.rollback();
                    } catch (rollbackError) {
                        console.error(
                            "Resource rollback failed:",
                            rollbackError.message
                        );
                    }

                    throw resourceError;
                }
            }



            // ==========================================
            // RELEASE VOLUNTEER WHEN RESOLVED
            // ==========================================

            if (
                status === "Resolved"
            ) {

                // ==========================================
                // FIND ACTIVE VOLUNTEERS
                // ==========================================

                const releaseRequest =
                    new sql.Request();


                releaseRequest.input(
                    "ReportId",
                    sql.Int,
                    reportId
                );


                const assignedVolunteers =
                    await releaseRequest.query(`

                        SELECT
                            Volunteer_id

                        FROM Volunteer_Assignments

                        WHERE Report_id =
                              @ReportId

                        AND Status =
                            'Active'

                    `);


                // ==========================================
                // COMPLETE ASSIGNMENTS
                // ==========================================

                const completeRequest =
                    new sql.Request();


                completeRequest.input(
                    "ReportId",
                    sql.Int,
                    reportId
                );


                await completeRequest.query(`

                    UPDATE Volunteer_Assignments

                    SET Status =
                        'Completed'

                    WHERE Report_id =
                          @ReportId

                    AND Status =
                        'Active'

                `);


                // ==========================================
                // MAKE VOLUNTEERS AVAILABLE
                // ==========================================

                for (
                    const assignment
                    of assignedVolunteers.recordset
                ) {

                    const volunteerRequest =
                        new sql.Request();


                    volunteerRequest.input(
                        "VolunteerId",
                        sql.Int,
                        assignment.Volunteer_id
                    );


                    await volunteerRequest.query(`

                        UPDATE Volunteers

                        SET Availability =
                            'Available'

                        WHERE Volunteer_id =
                              @VolunteerId

                    `);

                }

            }


            console.log(
                "UPDATED REPORT:",
                result.recordset[0]
            );


            return res.json({

                message:
                    "Status updated successfully",

                report:
                    result.recordset[0]

            });

        }
        catch (error) {

            console.error(
                "Update Status Error:",
                error
            );


            return res.status(500).json({

                message:
                    "Server Error"

            });

        }

    }
);


// ==========================================
// ASSIGN RESOURCE
// CURRENTLY WITHOUT AUTH
// TOKEN SECURITY WILL BE ADDED LATER
// ==========================================


router.post(
    "/:reportId/assign-resource",
    authenticateToken,
    authorizeRoles("authority"),
    async (req, res) => {
        const reportId = Number(req.params.reportId);
        const resourceId = Number(req.body?.resourceId);

        if (
            !Number.isSafeInteger(reportId) ||
            reportId <= 0 ||
            !Number.isSafeInteger(resourceId) ||
            resourceId <= 0
        ) {
            return res.status(400).json({
                message: "Valid report ID and resource ID are required."
            });
        }

        const transaction = new sql.Transaction();

        try {
            await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);

            // 1. Verify the report exists and lock its row.
            const reportRequest = new sql.Request(transaction);
            reportRequest.input("ReportId", sql.Int, reportId);

            const reportResult = await reportRequest.query(`
                SELECT Report_id
                FROM Incident_Reports WITH (UPDLOCK, HOLDLOCK)
                WHERE Report_id = @ReportId
            `);

            if (reportResult.recordset.length === 0) {
                await transaction.rollback();

                return res.status(404).json({
                    message: "Report not found."
                });
            }

            // 2. Verify the resource exists and lock its row.
            const resourceRequest = new sql.Request(transaction);
            resourceRequest.input("ResourceId", sql.Int, resourceId);

            const resourceResult = await resourceRequest.query(`
                SELECT Resource_id, Resource_Name, Quantity, Status
                FROM Resources WITH (UPDLOCK, HOLDLOCK)
                WHERE Resource_id = @ResourceId
            `);

            if (resourceResult.recordset.length === 0) {
                await transaction.rollback();

                return res.status(404).json({
                    message: "Resource not found."
                });
            }

            const resource = resourceResult.recordset[0];
            const quantity = Number(resource.Quantity);
            const status = String(resource.Status || "")
                .trim()
                .toLowerCase();

            if (!Number.isFinite(quantity) || quantity <= 0) {
                await transaction.rollback();

                return res.status(400).json({
                    message: "This resource has zero available units and cannot be assigned."
                });
            }

            if (status !== "available") {
                await transaction.rollback();

                return res.status(400).json({
                    message: "This resource is not available for assignment."
                });
            }

            // 3. Prevent duplicate active assignments for the same report/resource.
            const duplicateRequest = new sql.Request(transaction);
            duplicateRequest.input("ReportId", sql.Int, reportId);
            duplicateRequest.input("ResourceId", sql.Int, resourceId);

            const duplicateResult = await duplicateRequest.query(`
                SELECT TOP 1 Assignment_id
                FROM Resource_Assignments WITH (UPDLOCK, HOLDLOCK)
                WHERE Report_id = @ReportId
                  AND Resource_id = @ResourceId
                  AND LOWER(LTRIM(RTRIM(Status))) = 'active'
            `);

            if (duplicateResult.recordset.length > 0) {
                await transaction.rollback();

                return res.status(409).json({
                    message: "This resource is already actively assigned to this report."
                });
            }

            // 4. Decrement inventory and update status atomically.
            const updateRequest = new sql.Request(transaction);
            updateRequest.input("ResourceId", sql.Int, resourceId);

            const updateResult = await updateRequest.query(`
                UPDATE Resources
                SET
                    Quantity = Quantity - 1,
                    Status = CASE
                        WHEN Quantity - 1 <= 0 THEN 'Deployed'
                        ELSE 'Available'
                    END
                OUTPUT
                    INSERTED.Quantity AS RemainingQuantity,
                    INSERTED.Status AS ResourceStatus
                WHERE Resource_id = @ResourceId
                  AND Quantity > 0
                  AND LOWER(LTRIM(RTRIM(Status))) = 'available'
            `);

            if (updateResult.recordset.length === 0) {
                await transaction.rollback();

                return res.status(409).json({
                    message: "The resource is no longer available. Refresh and try again."
                });
            }

            // 5. Record the assignment within the same transaction.
            const assignmentRequest = new sql.Request(transaction);
            assignmentRequest.input("ReportId", sql.Int, reportId);
            assignmentRequest.input("ResourceId", sql.Int, resourceId);

            await assignmentRequest.query(`
                INSERT INTO Resource_Assignments
                    (Report_id, Resource_id, Status)
                VALUES
                    (@ReportId, @ResourceId, 'Active')
            `);

            await transaction.commit();

            const updatedResource = updateResult.recordset[0];

            return res.status(200).json({
                message: "Resource assigned successfully.",
                reportId,
                resourceId,
                remainingQuantity: updatedResource.RemainingQuantity,
                resourceStatus: updatedResource.ResourceStatus
            });
        } catch (error) {
            try {
                if (transaction._aborted !== true) {
                    await transaction.rollback();
                }
            } catch (rollbackError) {
                console.error("Resource assignment rollback failed:", rollbackError.message);
            }

            console.error("Resource assignment failed:", error);

            return res.status(500).json({
                message: "Failed to assign resource. No partial assignment should be retained."
            });
        }
    }
);



// ==========================================
// ASSIGN VOLUNTEER
// CURRENTLY WITHOUT AUTH
// TOKEN SECURITY WILL BE ADDED LATER
// ==========================================

router.post(
    "/:reportId/assign-volunteer",
    authenticateToken,
    authorizeRoles("authority"),
    async (req, res) => {
        const reportId = Number(req.params.reportId);
        const volunteerId = Number(req.body?.volunteerId);

        // ==========================================
        // VALIDATE IDs
        // ==========================================

        if (
            !Number.isInteger(reportId) ||
            reportId <= 0 ||
            !Number.isInteger(volunteerId) ||
            volunteerId <= 0
        ) {
            return res.status(400).json({
                message: "Valid report ID and volunteer ID are required."
            });
        }

        const transaction = new sql.Transaction();

        try {
            await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);

            // ==========================================
            // CHECK REPORT
            // ==========================================

            const reportRequest = new sql.Request(transaction);
            reportRequest.input("ReportId", sql.Int, reportId);

            const reportResult = await reportRequest.query(`
                SELECT Report_id, Status
                FROM Incident_Reports WITH (UPDLOCK, HOLDLOCK)
                WHERE Report_id = @ReportId
            `);

            if (reportResult.recordset.length === 0) {
                await transaction.rollback();
                return res.status(404).json({
                    message: "Report not found."
                });
            }

            const reportStatus = String(reportResult.recordset[0].Status || "")
                .trim()
                .toLowerCase();

            if (reportStatus === "rejected" || reportStatus === "resolved") {
                await transaction.rollback();
                return res.status(409).json({
                    message: "Volunteers cannot be assigned to a rejected or resolved report."
                });
            }

            // ==========================================
            // CHECK EXISTING ACTIVE ASSIGNMENT FOR THIS REPORT
            // ==========================================

            const checkVolRequest = new sql.Request(transaction);
            checkVolRequest.input("ReportId", sql.Int, reportId);
            checkVolRequest.input("VolunteerId", sql.Int, volunteerId);

            const existingVolAssignment = await checkVolRequest.query(`
                SELECT Assignment_id
                FROM Volunteer_Assignments WITH (UPDLOCK, HOLDLOCK)
                WHERE Report_id = @ReportId
                  AND Volunteer_id = @VolunteerId
                  AND LOWER(LTRIM(RTRIM(Status))) = 'active'
            `);

            if (existingVolAssignment.recordset.length > 0) {
                await transaction.rollback();
                return res.status(400).json({
                    message: "Volunteer already actively assigned to this report."
                });
            }

            // ==========================================
            // CHECK VOLUNTEER & AVAILABILITY
            // ==========================================

            const volunteerRequest = new sql.Request(transaction);
            volunteerRequest.input("VolunteerId", sql.Int, volunteerId);

            const volunteerResult = await volunteerRequest.query(`
                SELECT Volunteer_id, Availability
                FROM Volunteers WITH (UPDLOCK, HOLDLOCK)
                WHERE Volunteer_id = @VolunteerId
            `);

            if (volunteerResult.recordset.length === 0) {
                await transaction.rollback();
                return res.status(404).json({
                    message: "Volunteer not found."
                });
            }

            const volunteer = volunteerResult.recordset[0];
            const volAvailability = String(volunteer.Availability || "").trim().toLowerCase();

            if (volAvailability !== "available") {
                await transaction.rollback();
                return res.status(400).json({
                    message: "This volunteer is currently unavailable."
                });
            }

            // ==========================================
            // CHECK IF VOLUNTEER IS ASSIGNED TO ANOTHER REPORT
            // ==========================================

            const activeAssignmentRequest = new sql.Request(transaction);
            activeAssignmentRequest.input("VolunteerId", sql.Int, volunteerId);

            const activeAssignmentResult = await activeAssignmentRequest.query(`
                SELECT Assignment_id
                FROM Volunteer_Assignments WITH (UPDLOCK, HOLDLOCK)
                WHERE Volunteer_id = @VolunteerId
                  AND LOWER(LTRIM(RTRIM(Status))) = 'active'
            `);

            if (activeAssignmentResult.recordset.length > 0) {
                await transaction.rollback();
                return res.status(400).json({
                    message: "This volunteer is currently assigned to another active report."
                });
            }

            // ==========================================
            // CREATE VOLUNTEER ASSIGNMENT
            // ==========================================

            const insertRequest = new sql.Request(transaction);
            insertRequest.input("ReportId", sql.Int, reportId);
            insertRequest.input("VolunteerId", sql.Int, volunteerId);

            await insertRequest.query(`
                INSERT INTO Volunteer_Assignments
                (
                    Report_id,
                    Volunteer_id,
                    Status
                )
                VALUES
                (
                    @ReportId,
                    @VolunteerId,
                    'Active'
                )
            `);

            // ==========================================
            // MARK VOLUNTEER BUSY
            // ==========================================

            const updateRequest = new sql.Request(transaction);
            updateRequest.input("VolunteerId", sql.Int, volunteerId);

            await updateRequest.query(`
                UPDATE Volunteers
                SET Availability = 'Busy'
                WHERE Volunteer_id = @VolunteerId
            `);

            await transaction.commit();

            return res.status(200).json({
                message: "Volunteer assigned successfully",
                reportId,
                volunteerId
            });

        } catch (error) {
            try {
                if (transaction._aborted !== true) {
                    await transaction.rollback();
                }
            } catch (rollbackError) {
                console.error("Volunteer assignment rollback failed:", rollbackError.message);
            }

            console.error("Volunteer Assignment Error:", error);

            return res.status(500).json({
                message: "Server Error during volunteer assignment."
            });
        }
    }
);


// ==========================================
// EXPORT ROUTER
// ==========================================

module.exports = router;
