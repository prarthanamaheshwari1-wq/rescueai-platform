const express = require("express");
const router = express.Router();
const { sql } = require("../config/db");

// Get all active alerts

router.get("/", async (req, res) => {

    try {

        const request = new sql.Request();

        const result = await request.query(`
            SELECT *
            FROM Alerts
            WHERE Status = 'Active'
            ORDER BY Alert_id DESC
        `);

        res.status(200).json(result.recordset);

    } catch (error) {

        console.error("Get Alerts Error:", error);

        res.status(500).json({
            message: "Server Error"
        });

    }

});

module.exports = router;