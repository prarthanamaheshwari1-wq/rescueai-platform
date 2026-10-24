const express = require("express");
const router = express.Router();

const { sql } = require("../config/db");

// Get all disaster events
router.get("/", async (req, res) => {

    try {

        const request = new sql.Request();

        const result = await request.query(`
    SELECT
        *,
        CASE
            WHEN End_Date IS NOT NULL
                 AND End_Date < GETDATE()
                 AND LOWER(LTRIM(RTRIM(Status))) = 'active'
            THEN 'Completed'
            ELSE Status
        END AS Current_Status
    FROM Disaster_Events
    ORDER BY Disaster_id DESC
`);

        const disasterEvents = result.recordset.map((event) => {
            const { Current_Status, ...rest } = event;

            return {
                ...rest,
                Status: Current_Status
            };
        });

        res.status(200).json(disasterEvents);

    } catch (error) {

        console.error("Disaster Events Error:", error);

        res.status(500).json({
            message: "Server Error"
        });

    }

});

module.exports = router;