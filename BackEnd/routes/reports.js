const express = require("express");
console.log("REPORTS.JS LOADED");
const router = express.Router();
const { sql } = require("../config/db");
const upload = require("../middleware/upload");

const {
    generateReportSafely
} = require("../services/gemini");



// ==========================================
// CREATE EMERGENCY REPORT
// ==========================================

router.post("/emergency", upload.single("photo"), async (req, res) => {

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


        // ==========================================
        // EMERGENCY REPORT INPUT VALIDATION
        // ==========================================

        if (
            !title ||
            !description ||
            !category ||
            !severity ||
            !locationName
        ) {

            return res.status(400).json({
                message:
                    "Title, description, category, severity and location are required."
            });

        }


        const allowedSeverities = [
            "Low",
            "Medium",
            "High"
        ];


        if (!allowedSeverities.includes(severity)) {

            return res.status(400).json({
                message:
                    "Severity must be Low, Medium or High."
            });

        }


        if (
            latitude !== undefined &&
            latitude !== null &&
            latitude !== ""
        ) {

            if (!Number.isFinite(Number(latitude))) {

                return res.status(400).json({
                    message: "Invalid latitude."
                });

            }

        }


        if (
            longitude !== undefined &&
            longitude !== null &&
            longitude !== ""
        ) {

            if (!Number.isFinite(Number(longitude))) {

                return res.status(400).json({
                    message: "Invalid longitude."
                });

            }

        }


        // ==========================================
        // PHOTO PATH
        // ==========================================

        const photoPath = req.file
            ? `uploads/${req.file.filename}`
            : null;



        // ==========================================
        // INSERT EMERGENCY REPORT
        // ==========================================

        const request = new sql.Request();


        request.input(
            "Title",
            sql.NVarChar,
            title
        );

        request.input(
            "Description",
            sql.NVarChar,
            description
        );

        request.input(
            "Category",
            sql.NVarChar,
            category
        );

        request.input(
            "Severity",
            sql.NVarChar,
            severity
        );

        request.input(
            "LocationName",
            sql.NVarChar,
            locationName
        );

        request.input(
            "Latitude",
            sql.Decimal(10, 6),
            latitude
        );

        request.input(
            "Longitude",
            sql.Decimal(10, 6),
            longitude
        );

        request.input(
            "PhotoPath",
            sql.NVarChar(500),
            photoPath
        );


        // ==========================================
        // DIRECTLY GET NEW REPORT ID
        // ==========================================

        const insertResult = await request.query(`

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
            insertResult.recordset[0]?.Report_id || null;


        if (!reportId) {

            return res.status(500).json({
                message:
                    "Report was created but Report ID could not be generated."
            });

        }



        // ==========================================
        // AI ANALYSIS GENERATION
        // ==========================================

        let aiCategory = category;
        let aiSeverity = severity;

        let aiPriority = "Low";
        let aiSummary = "";
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


        // Maximum 100

        if (misinformationScore > 100) {

            misinformationScore = 100;

        }



        // ==========================================
        // PRIORITY LOGIC
        // ==========================================

        if (severity === "High") {

            aiPriority = "Critical";

        }
        else if (severity === "Medium") {

            aiPriority = "Moderate";

        }
        else {

            aiPriority = "Low";

        }



        // ==========================================
        // GEMINI AI INCIDENT ANALYSIS
        // ==========================================

        const prompt = `

You are RescueAI, an AI disaster-response assistant.

Analyze the following emergency incident:

Title: ${title}
Description: ${description}
Category: ${category}
Reported Severity: ${severity}
Location: ${locationName}

Provide a practical disaster-response analysis.

Return exactly in this format:

SUMMARY:
<2-3 sentence incident summary>

RECOMMENDATION:
<2-4 practical emergency response actions>

IMPORTANT FACTUAL RULES:
- Treat the Title, Description, Category, Reported Severity, and Location as fixed facts.
- Never change, replace, or invent the reported location.
- Never change or replace the reported category or severity.
- Never introduce a different city, location, category, or severity.
- Do not invent facts that are not present in the incident.
- You may provide general safety recommendations, but clearly base them on the information provided.
- Focus on immediate safety and disaster-response actions.

`;



        // ==========================================
        // SAFE GEMINI CALL
        // ==========================================

        try {

            const {
                text: aiText,
                needsManualReview
            } = await generateReportSafely(prompt);


            // ==========================================
            // MANUAL REVIEW FALLBACK
            // ==========================================

            if (needsManualReview) {

                aiSummary =
                    aiText ||
                    "AI analysis unavailable. Incident requires manual review.";

                aiRecommendation =
                    "Verify the incident and follow standard emergency response procedures.";

            }
            else {

                // ==========================================
                // EXTRACT SUMMARY
                // ==========================================

                const summaryMatch =
                    aiText.match(
                        /SUMMARY:\s*([\s\S]*?)\s*RECOMMENDATION:/i
                    );


                // ==========================================
                // EXTRACT RECOMMENDATION
                // ==========================================

                const recommendationMatch =
                    aiText.match(
                        /RECOMMENDATION:\s*([\s\S]*)/i
                    );


                aiSummary =
                    summaryMatch
                        ? summaryMatch[1].trim()
                        : "AI analysis generated successfully.";


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


            aiRecommendation =
                "Verify the incident and follow standard emergency response procedures.";

        }



        // ==========================================
        // SAVE AI ANALYSIS
        // ==========================================

        const aiRequest = new sql.Request();


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
                @AIRecommendation
            )

        `);



        // ==========================================
        // SUCCESS RESPONSE
        // ==========================================

        res.status(201).json({

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


        res.status(500).json({
            message: "Server Error"
        });

    }

});



// ==========================================
// GET ALL REPORTS
// ==========================================

router.get("/", async (req, res) => {

    try {

        const request = new sql.Request();


        const result = await request.query(`

            SELECT *
            FROM Incident_Reports
            ORDER BY Report_id DESC

        `);


        res.status(200).json(
            result.recordset
        );


    }
    catch (error) {

        console.error(
            "Get Reports Error:",
            error
        );


        res.status(500).json({
            message: "Server Error"
        });

    }

});



// ==========================================
// GET PENDING REPORTS
// ==========================================

router.get("/pending", async (req, res) => {

    try {

        const request = new sql.Request();


        const result = await request.query(`

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
                AI.AI_Recommendation

            FROM Incident_Reports IR

            LEFT JOIN AI_Analysis AI
                ON IR.Report_id = AI.Report_id

            WHERE IR.Status = 'Submitted'

            ORDER BY IR.Report_id DESC

        `);


        res.status(200).json(
            result.recordset
        );


    }
    catch (error) {

        console.error(error);


        res.status(500).json({
            message: "Server Error"
        });

    }

});



// ==========================================
// VERIFY REPORT
// ==========================================

router.put("/:reportId/verify", async (req, res) => {

    try {

        const { reportId } = req.params;


        const request = new sql.Request();


        request.input(
            "ReportId",
            sql.Int,
            reportId
        );


        await request.query(`

            UPDATE Incident_Reports

            SET Status = 'Verified'

            WHERE Report_id = @ReportId

        `);


        res.json({
            message: "Report Verified"
        });


    }
    catch (error) {

        console.error(error);


        res.status(500).json({
            message: "Server Error"
        });

    }

});



// ==========================================
// REJECT REPORT
// ==========================================

router.put("/:reportId/reject", async (req, res) => {

    try {

        const { reportId } = req.params;


        const request = new sql.Request();


        request.input(
            "ReportId",
            sql.Int,
            reportId
        );


        await request.query(`

            UPDATE Incident_Reports

            SET Status = 'Rejected'

            WHERE Report_id = @ReportId

        `);


        res.json({
            message: "Report Rejected"
        });


    }
    catch (error) {

        console.error(error);


        res.status(500).json({
            message: "Server Error"
        });

    }

});



// ==========================================
// GET RISK SUMMARY
// IMPORTANT: This route must come before /:reportId
// ==========================================

router.get("/risk-summary", async (req, res) => {

    try {

        const request = new sql.Request();


        const result = await request.query(`

            SELECT

                SUM(
                    CASE
                        WHEN LOWER(LTRIM(RTRIM(Severity))) = 'high'
                        THEN 1
                        ELSE 0
                    END
                ) AS HighRisk,

                SUM(
                    CASE
                        WHEN LOWER(LTRIM(RTRIM(Severity))) = 'medium'
                        THEN 1
                        ELSE 0
                    END
                ) AS MediumRisk,

                SUM(
                    CASE
                        WHEN LOWER(LTRIM(RTRIM(Severity))) = 'low'
                        THEN 1
                        ELSE 0
                    END
                ) AS LowRisk

            FROM Incident_Reports

        `);


        res.status(200).json(
            result.recordset[0]
        );


    }
    catch (error) {

        console.error(
            "Risk Summary Error:",
            error
        );


        res.status(500).json({
            message: "Server Error"
        });

    }

});



// ==========================================
// GET REPORT BY REPORT ID
// ==========================================

router.get("/:reportId", async (req, res) => {

    console.log(
        "=== GET REPORT DETAILS HIT ===",
        req.params.reportId
    );


    try {

        const { reportId } = req.params;


        const request = new sql.Request();


        request.input(
            "ReportId",
            sql.Int,
            reportId
        );


        const result = await request.query(`

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
                AI.AI_Recommendation,
                AI.Analyzed_At,

                ISNULL(RA.Assignment_id, 0) AS Assignment_id,
                ISNULL(RA.Status, 'No Assignment') AS Assignment_Status,

                ISNULL(R.Resource_id, 0) AS Resource_id,
                ISNULL(R.Resource_Name, 'None') AS Resource_Name,
                R.Resource_Type,
                R.Quantity,
                R.Location_Name AS Resource_Location,
                R.Status AS Resource_Status,

                ISNULL(VA.Assignment_id, 0) AS Volunteer_Assignment_Id,
                ISNULL(VA.Status, 'No Volunteer') AS Volunteer_Assignment_Status,

                ISNULL(V.Volunteer_id, 0) AS Volunteer_id,
                ISNULL(V.Skills, 'None') AS Volunteer_Skill,
                ISNULL(V.Availability, 'N/A') AS Volunteer_Status,
                ISNULL(V.Location_Name, 'N/A') AS Volunteer_Location

            FROM Incident_Reports IR

            LEFT JOIN Resource_Assignments RA
                ON IR.Report_id = RA.Report_id

            LEFT JOIN Resources R
                ON RA.Resource_id = R.Resource_id

            LEFT JOIN Volunteer_Assignments VA
                ON IR.Report_id = VA.Report_id

            LEFT JOIN Volunteers V
                ON VA.Volunteer_id = V.Volunteer_id

            LEFT JOIN AI_Analysis AI
                ON IR.Report_id = AI.Report_id

            WHERE IR.Report_id = @ReportId

        `);


        console.log(
            "SQL QUERY RESULT RECORDSET:",
            result.recordset
        );


        if (result.recordset.length === 0) {

            return res.status(404).json({
                message: "Report not found"
            });

        }


        res.status(200).json(
            result.recordset
        );


    }
    catch (error) {

        console.error(
            "Get Report Error:",
            error
        );


        res.status(500).json({
            message: "Server Error"
        });

    }

});



// ==========================================
// UPDATE REPORT STATUS
// ==========================================

router.put("/:reportId/status", async (req, res) => {

    try {

        console.log("=================================");
        console.log("UPDATE STATUS ROUTE HIT");
        console.log("Report ID:", req.params.reportId);
        console.log("Request Body:", req.body);
        console.log(
            "Received Status:",
            JSON.stringify(req.body.status)
        );
        console.log("=================================");


        const { reportId } = req.params;
        const { status } = req.body;


        const allowedStatuses = [
            "Submitted",
            "Verified",
            "Rejected",
            "Resolved"
        ];


        if (!allowedStatuses.includes(status)) {

            console.log(
                "INVALID STATUS RECEIVED:",
                JSON.stringify(status)
            );


            return res.status(400).json({

                message: "Invalid report status.",

                receivedStatus: status,

                allowedStatuses:
                    allowedStatuses

            });

        }


        const request = new sql.Request();


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


        const result = await request.query(`

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


        console.log(
            "UPDATED REPORT:",
            result.recordset[0]
        );


        res.json({

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


        res.status(500).json({
            message: "Server Error"
        });

    }

});



// ==========================================
// ASSIGN RESOURCE
// ==========================================

router.post("/:reportId/assign-resource", async (req, res) => {

    try {

        const { reportId } = req.params;
        const { resourceId } = req.body;


        // ==========================================
        // CHECK EXISTING ACTIVE ASSIGNMENT
        // ==========================================

        const checkRequest = new sql.Request();


        checkRequest.input(
            "ReportId",
            sql.Int,
            reportId
        );


        const existingAssignment =
            await checkRequest.query(`

                SELECT *

                FROM Resource_Assignments

                WHERE Report_id = @ReportId
                  AND Status = 'Active'

            `);


        if (existingAssignment.recordset.length > 0) {

            return res.status(400).json({

                message:
                    "Resource already assigned to this report"

            });

        }


        // ==========================================
        // INSERT RESOURCE ASSIGNMENT
        // ==========================================

        const request = new sql.Request();


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


        res.json({

            message:
                "Resource assigned successfully"

        });


    }
    catch (error) {

        console.error(
            "Assign Resource Error:",
            error
        );


        res.status(500).json({
            message: "Server Error"
        });

    }

});



// ==========================================
// ASSIGN VOLUNTEER
// ==========================================

router.post("/:reportId/assign-volunteer", async (req, res) => {

    try {

        const { reportId } = req.params;
        const { volunteerId } = req.body;


        // ==========================================
        // CHECK EXISTING ACTIVE ASSIGNMENT
        // ==========================================

        const checkRequest = new sql.Request();


        checkRequest.input(
            "ReportId",
            sql.Int,
            reportId
        );


        const existingAssignment =
            await checkRequest.query(`

                SELECT *

                FROM Volunteer_Assignments

                WHERE Report_id = @ReportId
                  AND Status = 'Active'

            `);


        if (existingAssignment.recordset.length > 0) {

            return res.status(400).json({

                message:
                    "Volunteer already assigned"

            });

        }



        // ==========================================
        // CHECK VOLUNTEER AVAILABILITY
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

                WHERE Volunteer_id = @VolunteerId

            `);


        if (volunteerResult.recordset.length === 0) {

            return res.status(404).json({

                message:
                    "Volunteer not found."

            });

        }


        const volunteer =
            volunteerResult.recordset[0];


        if (
            String(volunteer.Availability)
                .trim()
                .toLowerCase() !== "available"
        ) {

            return res.status(400).json({

                message:
                    "This volunteer is currently busy and cannot be assigned."

            });

        }



        // ==========================================
        // CREATE VOLUNTEER ASSIGNMENT
        // ==========================================

        const request = new sql.Request();


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
        // MARK VOLUNTEER AS BUSY
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

            SET Availability = 'Busy'

            WHERE Volunteer_id = @VolunteerId

        `);



        res.json({

            message:
                "Volunteer assigned successfully"

        });


    }
    catch (error) {

        console.error(
            "Volunteer Assignment Error:",
            error
        );


        res.status(500).json({

            message:
                "Server Error"

        });

    }

});



module.exports = router;