const express = require("express");
console.log("REPORTS.JS LOADED");

const router = express.Router();
const { sql } = require("../config/db");
const { authenticateToken, authorizeRoles } = require("../middleware/auth");

const upload = require("../middleware/upload");
const fs = require("fs");

const { generateReportSafely } = require("../services/gemini");
const { processDisasterImage } = require("../services/imageProcessor");
const { analyzeImageAuthenticity } = require("../services/imageAuthenticity");

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

            if (
                !title ||
                !description ||
                !category ||
                !locationName ||
                !req.file
            ) {

                if (req.file) {
                    safeDeleteFile(req.file.path);
                }

                return res.status(400).json({

                    message:
                        "Title, description, category, location, and a mandatory photo are required."

                });

            }

            // ==========================================
            // VALIDATE LATITUDE
            // ==========================================

            let parsedLatitude = null;

            if (
                latitude !== undefined &&
                latitude !== null &&
                latitude !== ""
            ) {

                parsedLatitude = Number(latitude);

                if (
                    !Number.isFinite(parsedLatitude) ||
                    parsedLatitude < -90 ||
                    parsedLatitude > 90
                ) {

                    if (req.file) {
                        safeDeleteFile(req.file.path);
                    }

                    return res.status(400).json({

                        message:
                            "Invalid latitude."

                    });

                }

            }


            // ==========================================
            // VALIDATE LONGITUDE
            // ==========================================

            let parsedLongitude = null;

            if (
                longitude !== undefined &&
                longitude !== null &&
                longitude !== ""
            ) {

                parsedLongitude = Number(longitude);

                if (
                    !Number.isFinite(parsedLongitude) ||
                    parsedLongitude < -180 ||
                    parsedLongitude > 180
                ) {

                    if (req.file) {
                        safeDeleteFile(req.file.path);
                    }

                    return res.status(400).json({

                        message:
                            "Invalid longitude."

                    });

                }

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
                manualReviewRequired: null
            };

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

                imageAuthenticity = await analyzeImageAuthenticity(
                    req.file.path
                );

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
                    Image_Authenticity_Manual_Review
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
                    @ImageAuthenticityManualReview
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
                    !!req.file

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


// ==========================================
// GET SINGLE REPORT + AI + RESOURCES + VOLUNTEERS
// ==========================================

router.get(
    "/:reportId",
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
                        AI.Image_Authenticity_Manual_Review

                    FROM Incident_Reports IR

                    LEFT JOIN AI_Analysis AI
                        ON IR.Report_id = AI.Report_id

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

        try {

            const reportId =
                Number(req.params.reportId);


            const volunteerId =
                Number(req.body.volunteerId);


            // ==========================================
            // VALIDATE IDs
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


            if (
                !Number.isInteger(volunteerId) ||
                volunteerId <= 0
            ) {

                return res.status(400).json({

                    message:
                        "Invalid volunteer ID."

                });

            }


            // ==========================================
            // CHECK REPORT
            // ==========================================

            const reportRequest =
                new sql.Request();


            reportRequest.input(
                "ReportId",
                sql.Int,
                reportId
            );


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
                    message: "Resources cannot be assigned to a rejected or resolved report."
                });
            }


            // ==========================================
            // CHECK EXISTING ACTIVE ASSIGNMENT
            // ==========================================

            const checkRequest =
                new sql.Request();


            checkRequest.input(
                "ReportId",
                sql.Int,
                reportId
            );


            const existingAssignment =
                await checkRequest.query(`

                    SELECT
                        Assignment_id

                    FROM Volunteer_Assignments

                    WHERE Report_id =
                          @ReportId

                    AND Status =
                        'Active'

                `);


            if (
                existingAssignment.recordset.length > 0
            ) {

                return res.status(400).json({

                    message:
                        "Volunteer already assigned to this report."

                });

            }


            // ==========================================
            // CHECK VOLUNTEER
            // ==========================================

            const volunteerRequest =
                new sql.Request();


            volunteerRequest.input(
                "VolunteerId",
                sql.Int,
                volunteerId
            );


            const volunteerResult =
                await volunteerRequest.query(`

                    SELECT

                        Volunteer_id,
                        Availability

                    FROM Volunteers

                    WHERE Volunteer_id =
                          @VolunteerId

                `);


            if (
                volunteerResult.recordset.length === 0
            ) {

                return res.status(404).json({

                    message:
                        "Volunteer not found."

                });

            }


            const volunteer =
                volunteerResult.recordset[0];


            // ==========================================
            // CHECK VOLUNTEER AVAILABILITY
            // ==========================================

            if (
                volunteer.Availability &&
                volunteer.Availability.toLowerCase() !==
                "available"
            ) {

                return res.status(400).json({

                    message:
                        "This volunteer is currently unavailable."

                });

            }


            // ==========================================
            // CHECK ACTIVE ASSIGNMENT
            // ==========================================

            const activeAssignmentRequest =
                new sql.Request();


            activeAssignmentRequest.input(
                "VolunteerId",
                sql.Int,
                volunteerId
            );


            const activeAssignmentResult =
                await activeAssignmentRequest.query(`

                    SELECT
                        Assignment_id

                    FROM Volunteer_Assignments

                    WHERE Volunteer_id =
                          @VolunteerId

                    AND Status =
                        'Active'

                `);


            if (
                activeAssignmentResult.recordset.length > 0
            ) {

                return res.status(400).json({

                    message:
                        "This volunteer is currently assigned to another active report."

                });

            }


            // ==========================================
            // CREATE VOLUNTEER ASSIGNMENT
            // ==========================================

            const request =
                new sql.Request();


            request.input(
                "ReportId",
                sql.Int,
                reportId
            );


            request.input(
                "VolunteerId",
                sql.Int,
                volunteerId
            );


            await request.query(`

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

            const updateRequest =
                new sql.Request();


            updateRequest.input(
                "VolunteerId",
                sql.Int,
                volunteerId
            );


            await updateRequest.query(`

                UPDATE Volunteers

                SET Availability =
                    'Busy'

                WHERE Volunteer_id =
                      @VolunteerId

            `);


            return res.json({

                message:
                    "Volunteer assigned successfully"

            });

        }
        catch (error) {

            console.error(
                "Volunteer Assignment Error:",
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
// EXPORT ROUTER
// ==========================================

module.exports = router;
