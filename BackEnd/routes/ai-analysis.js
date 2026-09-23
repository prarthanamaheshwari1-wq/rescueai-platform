const express = require("express");
const router = express.Router();

const { sql } = require("../config/db");

router.get("/", async (req, res) => {

    try {

        const request = new sql.Request();

        const result = await request.query(`
            SELECT *
            FROM AI_Analysis
            ORDER BY Analysis_id DESC
        `);

        res.status(200).json(result.recordset);

    } catch (error) {

        console.error("AI Analysis Error:", error);

        res.status(500).json({
            message: "Server Error"
        });

    }

});

module.exports = router;