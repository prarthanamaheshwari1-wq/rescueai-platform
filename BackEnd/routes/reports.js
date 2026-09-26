const express = require("express");
console.log("REPORTS.JS LOADED");
const router = express.Router();
const { sql } = require("../config/db");
const upload = require("../middleware/upload");

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

        const photoPath = req.file ? `uploads/${req.file.filename}` : null;

        const request = new sql.Request();

        request.input("Title", sql.NVarChar, title);
        request.input("Description", sql.NVarChar, description);
        request.input("Category", sql.NVarChar, category);
        request.input("Severity", sql.NVarChar, severity);
        request.input("LocationName", sql.NVarChar, locationName);
        request.input("Latitude", sql.Decimal(10, 6), latitude);
        request.input("Longitude", sql.Decimal(10, 6), longitude);
        request.input("PhotoPath", sql.NVarChar(500), photoPath);

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

        const idRequest = new sql.Request();

        idRequest.input("Title", sql.NVarChar, title);
        idRequest.input("Description", sql.NVarChar, description);
        idRequest.input("PhotoPath", sql.NVarChar(500), photoPath);

        const idResult = await idRequest.query(`
    SELECT TOP 1 Report_id
    FROM Incident_Reports
    WHERE Title = @Title
      AND Description = @Description
      AND Photo_Path = @PhotoPath
    ORDER BY Report_id DESC
`);

        const reportId = idResult.recordset[0]?.Report_id || null;

        // AI Analysis Generation

        let aiCategory = category;
        let aiSeverity = severity;

        let aiPriority = "Low";
        let aiSummary = "";
        let aiRecommendation = "";
        let misinformationScore = 0;

        // Misinformation Detection

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

        // Priority Logic

        if (severity === "High") {
            aiPriority = "Critical";
        }
        else if (severity === "Medium") {
            aiPriority = "Moderate";
        }
        else {
            aiPriority = "Low";
        }

        // Category Based Analysis

        if (category === "Fire") {

            aiSummary =
                "High risk fire incident reported.";

            aiRecommendation =
                "Dispatch fire brigade immediately and evacuate nearby civilians.";

        }
        else if (category === "Flood") {

            aiSummary =
                "Flood risk detected in reported area.";

            aiRecommendation =
                "Move residents to higher ground and deploy rescue teams.";

        }
        else if (category === "Earthquake") {

            aiSummary =
                "Possible earthquake emergency reported.";

            aiRecommendation =
                "Activate disaster response teams and inspect affected structures.";

        }
        else {

            aiSummary =
                "Incident reported for review.";

            aiRecommendation =
                "Authority verification required.";

        }

        // Save AI Analysis

        const aiRequest = new sql.Request();

        aiRequest.input("ReportId", sql.Int, reportId);
        aiRequest.input("AICategory", sql.NVarChar, aiCategory);
        aiRequest.input("AISeverity", sql.NVarChar, aiSeverity);
        aiRequest.input("AIPriority", sql.NVarChar, aiPriority);
        aiRequest.input("MIScore", sql.Decimal(5, 2), misinformationScore);
        aiRequest.input("AISummary", sql.NVarChar, aiSummary);
        aiRequest.input("AIRecommendation", sql.NVarChar, aiRecommendation);

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

        res.status(201).json({
            message: "Emergency report submitted successfully",
            reportId: reportId,
            photoUploaded: !!req.file
        });

    } catch (error) {
        console.error("Emergency Report Error:", error);

        res.status(500).json({
            message: "Server Error"
        });
    }
});

router.get("/", async (req, res) => {

    try {

        const request = new sql.Request();

        const result = await request.query(`
            SELECT *
            FROM Incident_Reports
            ORDER BY Report_id DESC
        `);

        res.status(200).json(result.recordset);

    } catch (error) {

        console.error("Get Reports Error:", error);

        res.status(500).json({
            message: "Server Error"
        });

    }

});

// Get report by Report ID
// Get report by Report ID
// Get report by Report ID
router.get("/:reportId", async (req, res) => {

    console.log("=== GET REPORT DETAILS HIT ===", req.params.reportId);

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
                IR.Status AS Report_Status,
                IR.Created_At,
                IR.Photo_Path,

                ISNULL(RA.Assignment_id, 0) AS Assignment_id,
                ISNULL(RA.Status, 'No Assignment') AS Assignment_Status,

                ISNULL(R.Resource_id, 0) AS Resource_id,
                ISNULL(R.Resource_Name, 'None') AS Resource_Name,
                R.Resource_Type,
                R.Quantity,
                R.Location_Name AS Resource_Location,
                R.Status AS Resource_Status

            FROM Incident_Reports IR

            LEFT JOIN Resource_Assignments RA
                ON IR.Report_id = RA.Report_id

            LEFT JOIN Resources R
                ON RA.Resource_id = R.Resource_id

            WHERE IR.Report_id = @ReportId
        `);

        console.log("SQL QUERY RESULT RECORDSET:", result.recordset);

        if (result.recordset.length === 0) {
            return res.status(404).json({
                message: "Report not found"
            });
        }

        // Return all matched rows or array of joined data
        res.status(200).json(result.recordset);

    } catch (error) {

        console.error(
            "Get Report Error:",
            error
        );

        res.status(500).json({
            message: "Server Error"
        });

    }

});

// Update report status
router.put("/:reportId/status", async (req, res) => {
    try {

        console.log("NEW REPORT DETAILS ROUTE HIT");

        const { reportId } = req.params;
        const { status } = req.body;

        const request = new sql.Request();

        request.input("ReportId", sql.Int, reportId);
        request.input("Status", sql.NVarChar, status);

        await request.query(`
            UPDATE Incident_Reports
            SET Status = @Status
            WHERE Report_id = @ReportId
        `);

        res.json({
            message: "Status updated successfully"
        });

    } catch (error) {

        console.error("Update Status Error:", error);

        res.status(500).json({
            message: "Server Error"
        });
    }
});

module.exports = router;

