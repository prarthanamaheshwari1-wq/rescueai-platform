
const express = require("express");
const router = express.Router();

const { sql } = require("../config/db");
const { authenticateToken, authorizeRoles } = require("../middleware/auth");

router.get(
    "/",
    authenticateToken,
    authorizeRoles("authority"),
    async (req, res) => {

        try {

            const request = new sql.Request();

            const result = await request.query(`
                SELECT
    Analysis_id,
    Report_id,
    AI_Category,
    AI_Severity,
    AI_Priority,
    Misinformation_Score,
    AI_Summary,
    AI_Recommendation,
    AI_Visual_Findings,
    Image_Authenticity_Status,
    Image_Authenticity_Prediction,
    Image_Authenticity_Reason,
    Image_Authenticity_Manual_Review
FROM AI_Analysis
ORDER BY Analysis_id DESC
            `);

            return res.status(200).json(result.recordset);

        } catch (error) {

            console.error("AI Analysis Error:", error);

            return res.status(500).json({
                message: "Server Error"
            });

        }

    }
);

module.exports = router;
