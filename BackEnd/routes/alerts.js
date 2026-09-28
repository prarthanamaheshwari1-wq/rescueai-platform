const express = require("express");
const router = express.Router();
const { sql } = require("../config/db");

// GET /api/alerts - Fetch only the latest active alert per city and type
router.get("/", async (req, res) => {
    try {
        const request = new sql.Request();

        // Common Table Expression (CTE) to partition active alerts by Location and Title,
        // ranking them so only the latest (highest Alert_id) gets RowNum = 1.
        const result = await request.query(`
            WITH RankedAlerts AS (
                SELECT 
                    Alert_id,
                    Title,
                    Description,
                    Alert_Type,
                    Severity,
                    Location_Name,
                    Status,
                    ROW_NUMBER() OVER (
                        PARTITION BY Location_Name, Title 
                        ORDER BY Alert_id DESC
                    ) AS RowNum
                FROM Alerts
                WHERE UPPER(Status) = 'ACTIVE'
            )
            SELECT 
                Alert_id,
                Title,
                Description,
                Alert_Type,
                Severity,
                Location_Name,
                Status
            FROM RankedAlerts
            WHERE RowNum = 1
            ORDER BY Alert_id DESC;
        `);

        return res.status(200).json(result.recordset);

    } catch (error) {
        console.error("Get Alerts Route Error:", error.message);

        return res.status(500).json({
            message: "Failed to fetch active alerts from database",
            error: error.message
        });
    }
});

module.exports = router;