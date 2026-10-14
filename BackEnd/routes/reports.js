const express = require("express");
console.log("REPORTS.JS LOADED");

const router = express.Router();
const { sql } = require("../config/db");
const { authenticateToken, authorizeRoles } = require("../middleware/auth");

const upload = require("../middleware/upload");
const fs = require("fs");

const { generateReportSafely } = require("../services/gemini");
const { processDisasterImage } = require("../services/imageProcessor");

// ==========================================
// SAFE DELETE FILE
// ==========================================

const safeDeleteFile = (filePath) => {

    if (filePath && fs.existsSync(filePath)) {

        try {

            fs.unlinkSync(filePath);

        }
        catch (err) {

            console.error(
                `Failed to clean up file at ${filePath}:`,
                err.message
            );

        }

    }

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

        try {

            const {
                title,
                description,
                category,
                severity,
                locationName,
                latitude,
                longitude
            } = req.body;


            console.log(
                "RECEIVED SEVERITY:",
                JSON.stringify(severity)
            );


            // ==========================================
            // INPUT VALIDATION
            // ==========================================

            if (
                !title ||
                !description ||
                !category ||
                !severity ||
                !locationName
            ) {

                if (req.file) {
                    safeDeleteFile(req.file.path);
                }

                return res.status(400).json({

                    message:
                        "Title, description, category, severity and location are required."

                });

            }


            // ==========================================
            // VALIDATE SEVERITY
            // ==========================================

            const allowedSeverities = [
                "Low",
                "Medium",
                "High",
                "Critical"
            ];

            if (!allowedSeverities.includes(severity)) {

                if (req.file) {
                    safeDeleteFile(req.file.path);
                }

                return res.status(400).json({

                    message:
                        "Severity must be Low, Medium, High or Critical."

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
                "Severity",
                sql.NVarChar,
                severity
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
                        @Severity,
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
            let aiSeverity = severity;

            let aiPriority = "Low";

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


            suspiciousWords.forEach(
                word => {

                    if (
                        reportText.includes(word)
                    ) {

                        misinformationScore += 20;

                    }

                }
            );


            if (
                misinformationScore > 100
            ) {

                misinformationScore = 100;

            }


            // ==========================================
            // PRIORITY LOGIC
            // ==========================================

            if (severity === "Critical") {

                aiPriority = "Critical";

            }
            else if (severity === "High") {

                aiPriority = "High";

            }
            else if (severity === "Medium") {

                aiPriority = "Moderate";

            }
            else {

                aiPriority = "Low";

            }


            // ==========================================
            // GEMINI PROMPT
            // ==========================================

            const prompt = `

You are RescueAI, an AI disaster-response assistant.

Analyze this emergency incident using BOTH:

1. The information provided by the user.
2. The uploaded disaster image, if an image is available.

Incident Information:

Title: ${title}
Description: ${description}
Category: ${category}
Reported Severity: ${severity}
Location: ${locationName}

IMAGE ANALYSIS REQUIREMENTS:

- Carefully inspect the uploaded image when available.
- Identify visible disaster conditions.
- Identify visible damage, hazards, affected people, vehicles, buildings or infrastructure.
- Identify visible rescue or emergency-response activity.
- Do not assume that something is present if it cannot be reasonably observed.
- Clearly distinguish visible observations from information provided by the user.
- If the image does not provide enough information, say so.

RETURN EXACTLY IN THIS FORMAT:

SUMMARY:
<2-3 sentence summary combining the reported incident and visible image evidence>

VISUAL_FINDINGS:
<short bullet-style list of important things visibly detected in the image>

RECOMMENDATION:
<2-4 practical emergency response actions based on the incident and visible conditions>

IMPORTANT FACTUAL RULES:

- Treat the Title, Description, Category, Reported Severity, and Location as fixed facts.
- Never change, replace, or invent the reported location.
- Never change or replace the reported category or severity.
- Never introduce a different city, location, category, or severity.
- Do not invent people, damage, casualties, rescue activity, or hazards that are not supported by the report or image.
- Image observations must be described only when reasonably visible.
- Focus on immediate safety and disaster-response actions.
- VISUAL_FINDINGS must contain only observations supported by the uploaded image.
- If no image is available, write: No image evidence available.
- Keep VISUAL_FINDINGS concise and practical.

`;


            // ==========================================
            // GEMINI AI ANALYSIS
            // ==========================================

            try {

                const {
                    text: aiText,
                    needsManualReview
                } =
                    await generateReportSafely(
                        prompt,
                        imageData
                    );


                if (
                    needsManualReview
                ) {

                    aiSummary =
                        aiText ||
                        "AI analysis unavailable. Incident requires manual review.";


                    aiVisualFindings =
                        "No reliable image analysis available.";


                    aiRecommendation =
                        "Verify the incident and follow standard emergency response procedures.";

                }
                else {

                    const safeAiText =
                        typeof aiText === "string"
                            ? aiText
                            : "";


                    // ==========================================
                    // EXTRACT SUMMARY
                    // ==========================================

                    const summaryMatch =
                        safeAiText.match(
                            /SUMMARY:\s*([\s\S]*?)(?=\s*VISUAL_FINDINGS:|\s*RECOMMENDATION:|$)/i
                        );


                    // ==========================================
                    // EXTRACT VISUAL FINDINGS
                    // ==========================================

                    const visualFindingsMatch =
                        safeAiText.match(
                            /VISUAL_FINDINGS:\s*([\s\S]*?)(?=\s*RECOMMENDATION:|$)/i
                        );


                    // ==========================================
                    // EXTRACT RECOMMENDATION
                    // ==========================================

                    const recommendationMatch =
                        safeAiText.match(
                            /RECOMMENDATION:\s*([\s\S]*)/i
                        );


                    aiSummary =
                        summaryMatch
                            ? summaryMatch[1].trim()
                            : "AI analysis generated successfully.";


                    aiVisualFindings =
                        visualFindingsMatch
                            ? visualFindingsMatch[1].trim()
                            : "No image evidence available.";


                    aiRecommendation =
                        recommendationMatch
                            ? recommendationMatch[1].trim()
                            : "Follow standard emergency response procedures.";

                }

            }
            catch (aiError) {

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
                    AI_Recommendation
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
                    @AIRecommendation
                )

            `);


            // ==========================================
            // CLEANUP TEMPORARY FILES
            // ==========================================

            if (req.file) {

                safeDeleteFile(
                    req.file.path
                );

            }


            if (
                processedImagePath &&
                processedImagePath !== req.file?.path
            ) {

                safeDeleteFile(
                    processedImagePath
                );

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

            if (req.file) {

                safeDeleteFile(
                    req.file.path
                );

            }


            if (
                processedImagePath &&
                processedImagePath !== req.file?.path
            ) {

                safeDeleteFile(
                    processedImagePath
                );

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
                        AI.Analyzed_At

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


                AI_Analysis:
                    hasAIAnalysis
                        ? {

                            Category:
                                firstRow.AI_Category,

                            Severity:
                                firstRow.AI_Severity,

                            Priority:
                                firstRow.AI_Priority,

                            Misinformation_Score:
                                firstRow.Misinformation_Score,

                            Summary:
                                firstRow.AI_Summary,

                            Visual_Findings:
                                firstRow.AI_Visual_Findings,

                            Recommendation:
                                firstRow.AI_Recommendation,

                            Analyzed_At:
                                firstRow.Analyzed_At

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

        try {

            const reportId =
                Number(req.params.reportId);


            const resourceId =
                Number(req.body.resourceId);


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
                !Number.isInteger(resourceId) ||
                resourceId <= 0
            ) {

                return res.status(400).json({

                    message:
                        "Invalid resource ID."

                });

            }


            // ==========================================
            // CHECK REPORT
            // ==========================================

            const reportCheckRequest =
                new sql.Request();


            reportCheckRequest.input(
                "ReportId",
                sql.Int,
                reportId
            );


            const reportResult =
                await reportCheckRequest.query(`

                    SELECT
                        Report_id

                    FROM Incident_Reports

                    WHERE Report_id =
                          @ReportId

                `);


            if (
                reportResult.recordset.length === 0
            ) {

                return res.status(404).json({

                    message:
                        "Report not found."

                });

            }


            // ==========================================
            // CHECK RESOURCE
            // ==========================================

            const resourceCheckRequest =
                new sql.Request();


            resourceCheckRequest.input(
                "ResourceId",
                sql.Int,
                resourceId
            );


            const resourceResult =
                await resourceCheckRequest.query(`

                    SELECT

                        Resource_id,
                        Resource_Name,
                        Resource_Type,
                        Quantity,
                        Status

                    FROM Resources

                    WHERE Resource_id =
                          @ResourceId

                `);


            if (
                resourceResult.recordset.length === 0
            ) {

                return res.status(404).json({

                    message:
                        "Resource not found."

                });

            }


            const resource =
                resourceResult.recordset[0];


            // ==========================================
            // CHECK RESOURCE STATUS
            // ==========================================

            if (
                resource.Status &&
                resource.Status.toLowerCase() !== "available"
            ) {

                return res.status(400).json({

                    message:
                        "This resource is currently unavailable."

                });

            }


            // ==========================================
            // CHECK QUANTITY
            // ==========================================

            if (
                Number(resource.Quantity) <= 0
            ) {

                return res.status(400).json({

                    message:
                        "This resource is currently unavailable because its quantity is 0."

                });

            }


            // ==========================================
            // CHECK DUPLICATE ACTIVE ASSIGNMENT
            // ==========================================

            const existingRequest =
                new sql.Request();


            existingRequest.input(
                "ReportId",
                sql.Int,
                reportId
            );


            existingRequest.input(
                "ResourceId",
                sql.Int,
                resourceId
            );


            const existingAssignment =
                await existingRequest.query(`

                    SELECT
                        Assignment_id

                    FROM Resource_Assignments

                    WHERE Report_id =
                          @ReportId

                    AND Resource_id =
                        @ResourceId

                    AND Status =
                        'Active'

                `);


            if (
                existingAssignment.recordset.length > 0
            ) {

                return res.status(400).json({

                    message:
                        "This resource is already assigned to this report."

                });

            }


            // ==========================================
            // INSERT ASSIGNMENT
            // ==========================================

            const request =
                new sql.Request();


            request.input(
                "ReportId",
                sql.Int,
                reportId
            );


            request.input(
                "ResourceId",
                sql.Int,
                resourceId
            );


            await request.query(`

                INSERT INTO Resource_Assignments
                (
                    Report_id,
                    Resource_id,
                    Status
                )

                VALUES
                (
                    @ReportId,
                    @ResourceId,
                    'Active'
                )

            `);


            // ==========================================
            // DECREASE RESOURCE QUANTITY
            // ==========================================

            const quantityRequest =
                new sql.Request();


            quantityRequest.input(
                "ResourceId",
                sql.Int,
                resourceId
            );


            await quantityRequest.query(`

                UPDATE Resources

                SET Quantity =
                    Quantity - 1

                WHERE Resource_id =
                      @ResourceId

                AND Quantity > 0

            `);


            return res.json({

                message:
                    "Resource assigned successfully"

            });

        }
        catch (error) {

            console.error(
                "Assign Resource Error:",
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


            const reportResult =
                await reportRequest.query(`

                    SELECT
                        Report_id

                    FROM Incident_Reports

                    WHERE Report_id =
                          @ReportId

                `);


            if (
                reportResult.recordset.length === 0
            ) {

                return res.status(404).json({

                    message:
                        "Report not found."

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