const express = require("express");
const router = express.Router();
const axios = require("axios");
const { sql } = require("../config/db");

router.get("/", async (req, res) => {
    try {

        const city = req.query.city || "Delhi";

        const apiKey = process.env.OPENWEATHER_API_KEY;

        const response = await axios.get(
            `https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${apiKey}&units=metric`
        );

        const weatherData = {
            city: response.data.name,
            temperature: response.data.main.temp,
            humidity: response.data.main.humidity,
            windSpeed: response.data.wind.speed,
            condition: response.data.weather[0].main
        };

        let riskLevel = "Low";
        let disasterType = "None";

        // let riskLevel = "High";
        // let disasterType = "Storm";

        // Heatwave Detection
        if (weatherData.temperature >= 40) {
            riskLevel = "High";
            disasterType = "Heatwave";
        }

        // Storm Detection
        if (weatherData.windSpeed >= 20) {
            riskLevel = "High";
            disasterType = "Storm";
        }

        // Flood Detection
        if (
            weatherData.condition.toLowerCase().includes("rain")
            && weatherData.humidity >= 80
        ) {
            riskLevel = "High";
            disasterType = "Flood";
        }

        if (disasterType !== "None") {

            const checkRequest = new sql.Request();

            checkRequest.input(
                "DisasterType",
                sql.NVarChar,
                disasterType
            );

            const existingAlert = await checkRequest.query(`
        SELECT TOP 1 *
        FROM Disaster_Events
        WHERE Disaster_Type = @DisasterType
        AND LOWER(Status) = 'active'
    `);

            if (existingAlert.recordset.length === 0) {

                const insertRequest = new sql.Request();

                insertRequest.input(
                    "DisasterType",
                    sql.NVarChar,
                    disasterType
                );

                insertRequest.input(
                    "DisasterName",
                    sql.NVarChar,
                    `Automatic ${disasterType} Alert`
                );

                insertRequest.input(
                    "Description",
                    sql.NVarChar,
                    `Generated automatically by RescueAI Weather Monitoring System`
                );

                await insertRequest.query(`
            INSERT INTO Disaster_Events
            (
                Disaster_Type,
                Disaster_Name,
                Description,
                Start_Date,
                End_Date,
                Status
            )
            VALUES
            (
                @DisasterType,
                @DisasterName,
                @Description,
                GETDATE(),
                DATEADD(day, 3, GETDATE()),
                'active'
            )
        `);

                console.log(`${disasterType} alert created`);
            }
        }

        res.json({
            ...weatherData,
            riskLevel,
            disasterType
        });

    } catch (error) {

        console.error("Weather API Error:", error.message);

        res.status(500).json({
            message: "Weather data fetch failed"
        });

    }
});

module.exports = router;