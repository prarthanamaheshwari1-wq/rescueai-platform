const express = require("express");
const router = express.Router();

const { sql } = require("../config/db");

// Get all disaster events
router.get("/", async (req, res) => {

    try {

        const request = new sql.Request();

        const result = await request.query(`
            SELECT *
            FROM Disaster_Events
            ORDER BY Disaster_id DESC
        `);

        res.status(200).json(result.recordset);

    } catch (error) {

        console.error("Disaster Events Error:", error);

        res.status(500).json({
            message: "Server Error"
        });

    }

});

module.exports = router;