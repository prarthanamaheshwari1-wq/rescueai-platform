const express = require("express");
const router = express.Router();
const axios = require("axios");
const { sql } = require("../config/db");

router.get("/", async (req, res) => {
    try {
        const city = req.query.city || "Delhi";
        const apiKey = process.env.OPENWEATHER_API_KEY;

        if (!apiKey) {
            console.error("OPENWEATHER_API_KEY is missing in process.env!");
            return res.status(500).json({
                message: "Server configuration error: Missing API Key"
            });
        }

        // Fetch weather data from OpenWeather API
        const response = await axios.get(
            `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${apiKey}&units=metric`
        );

        const weatherData = {
            city: response.data.name,
            temperature: response.data.main.temp,
            humidity: response.data.main.humidity,
            windSpeed: response.data.wind.speed,
            condition: response.data.weather[0]?.main || "Clear"
        };

        let riskLevel = "Low";
        let disasterType = "None";

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
            weatherData.condition.toLowerCase().includes("rain") &&
            weatherData.humidity >= 80
        ) {
            riskLevel = "High";
            disasterType = "Flood";
        }

        // Isolated Database Block (Prevents DB errors from failing the whole endpoint)
        if (disasterType !== "None") {
            try {
                const checkRequest = new sql.Request();
                checkRequest.input("DisasterType", sql.NVarChar, disasterType);

                const existingAlert = await checkRequest.query(`
                    SELECT TOP 1 *
                    FROM Disaster_Events
                    WHERE Disaster_Type = @DisasterType
                    AND LOWER(Status) = 'active'
                `);

                if (true) {
                    const insertRequest = new sql.Request();

                    insertRequest.input("DisasterType", sql.NVarChar, disasterType);
                    insertRequest.input("DisasterName", sql.NVarChar, `Automatic ${disasterType} Alert`);
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

                    const alertRequest = new sql.Request();

                    alertRequest.input(
                        "Title",
                        sql.NVarChar,
                        `${disasterType} Warning`
                    );

                    alertRequest.input(
                        "Description",
                        sql.NVarChar,
                        `Potential ${disasterType} detected by RescueAI Weather Monitoring System`
                    );

                    alertRequest.input(
                        "AlertType",
                        sql.NVarChar,
                        "Weather"
                    );

                    alertRequest.input(
                        "Severity",
                        sql.NVarChar,
                        "High"
                    );

                    alertRequest.input(
                        "LocationName",
                        sql.NVarChar,
                        city
                    );

                    await alertRequest.query(`
                        INSERT INTO Alerts
                        (
                            Title,
                            Description,
                            Alert_Type,
                            Severity,
                            Location_Name,
                            Status
                        )
                        VALUES
                        (
                            @Title,
                            @Description,
                            @AlertType,
                            @Severity,
                            @LocationName,
                            'Active'
                        )
                    `);

                    console.log(`Automatic ${disasterType} alert created in database.`);
                }
            } catch (dbError) {
                console.error("Disaster_Events DB Operation Failed:", dbError.message);
                // DB logging failed, but weather data can still return cleanly
            }
        }

        res.json({
            ...weatherData,
            riskLevel,
            disasterType
        });

    } catch (error) {
        if (error.response) {
            console.error("OpenWeather API Error Status:", error.response.status);
            console.error("OpenWeather API Error Data:", error.response.data);
        } else {
            console.error("Weather Route Network/Server Error:", error.message);
        }

        res.status(500).json({
            message: "Weather data fetch failed",
            details: error.response?.data?.message || error.message
        });
    }
});

module.exports = router;