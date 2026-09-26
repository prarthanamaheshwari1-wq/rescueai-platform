const express = require("express");
const router = express.Router();
const { sql } = require("../config/db");

// Get all volunteers
router.get("/", async (req, res) => {
    try {

        const request = new sql.Request();

        const result = await request.query(`
            SELECT
                V.Volunteer_id,
                U.Full_Name,
                U.Email,
                U.Phone_No,
                V.Skills,
                V.Availability,
                V.Location_Name,
                V.Latitude,
                V.Longitude
            FROM Volunteers V
            INNER JOIN Users U
                ON V.User_id = U.User_id
            ORDER BY V.Volunteer_id DESC
        `);

        res.status(200).json(result.recordset);

    } catch (error) {

        console.error("Volunteer Error:", error);

        res.status(500).json({
            message: "Server Error"
        });

    }
});

module.exports = router;