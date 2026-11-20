const express = require("express");
const router = express.Router();
const axios = require("axios");
const { sql } = require("../config/db");

router.get("/", async (req, res) => {

    try {

        const cityInput = req.query.city ?? "Delhi";

        if (
            typeof cityInput !== "string" ||
            cityInput.trim().length === 0 ||
            cityInput.trim().length > 100
        ) {
            return res.status(400).json({
                message: "Please provide a valid city name"
            });
        }

        const city = cityInput.trim();
        const apiKey = process.env.OPENWEATHER_API_KEY;

        if (!apiKey) {

            return res.status(500).json({
                message: "OPENWEATHER_API_KEY missing"
            });

        }

        const response = await axios.get(
            `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${apiKey}&units=metric`,
            {
                timeout: 10000
            }
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
            weatherData.condition.toLowerCase().includes("rain")
            && weatherData.humidity >= 80
        ) {

            riskLevel = "High";
            disasterType = "Flood";

        }

        if (disasterType !== "None") {

            try {

                // -------------------------------------------------------------
                // 1. ATOMIC DISASTER EVENT CHECK & INSERT
                // -------------------------------------------------------------

                const disasterQuery = new sql.Request();

                disasterQuery.input(
                    "DisasterType",
                    sql.NVarChar,
                    disasterType
                );

                disasterQuery.input(
                    "DisasterName",
                    sql.NVarChar,
                    `Automatic ${disasterType} Alert`
                );

                disasterQuery.input(
                    "Description",
                    sql.NVarChar,
                    `Generated automatically by RescueAI Weather Monitoring System`
                );

                await disasterQuery.query(`
    BEGIN TRY
        BEGIN TRANSACTION;

        IF NOT EXISTS (
            SELECT 1
            FROM Disaster_Events WITH (UPDLOCK, HOLDLOCK)
            WHERE Disaster_Type = @DisasterType
              AND LOWER(LTRIM(RTRIM(Status))) = 'active'
              AND (End_Date IS NULL OR End_Date >= GETDATE())
        )
        BEGIN
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
            );
        END;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0
            ROLLBACK TRANSACTION;

        THROW;
    END CATCH;
`);

                // -------------------------------------------------------------
                // 2. ATOMIC ALERT CHECK & INSERT (Prevents Race Conditions)
                // -------------------------------------------------------------

                const alertQuery = new sql.Request();

                alertQuery.input(
                    "Title",
                    sql.NVarChar,
                    `${disasterType} Warning`
                );

                alertQuery.input(
                    "Description",
                    sql.NVarChar,
                    `Potential ${disasterType} detected by RescueAI Weather Monitoring System`
                );

                alertQuery.input(
                    "AlertType",
                    sql.NVarChar,
                    "Weather"
                );

                alertQuery.input(
                    "Severity",
                    sql.NVarChar,
                    "High"
                );

                alertQuery.input(
                    "LocationName",
                    sql.NVarChar,
                    city
                );

                const alertResult = await alertQuery.query(`
    BEGIN TRY
        BEGIN TRANSACTION;

        DECLARE @Inserted BIT = 0;

        IF NOT EXISTS (
            SELECT 1
            FROM Alerts WITH (UPDLOCK, HOLDLOCK)
            WHERE Title = @Title
              AND Location_Name = @LocationName
              AND UPPER(Status) = 'ACTIVE'
        )
        BEGIN
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
            );

            SET @Inserted = 1;
        END;

        COMMIT TRANSACTION;

        SELECT @Inserted AS Inserted;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0
            ROLLBACK TRANSACTION;

        THROW;
    END CATCH;
`);

                if (alertResult.recordset[0]?.Inserted === 1) {

                    console.log(
                        `${disasterType} alert created for ${city}`
                    );

                } else {

                    console.log(
                        `Alert for ${city} (${disasterType}) already active. Skipping insert.`
                    );

                }

            } catch (dbError) {

                console.error(
                    "Database Operation Failed:",
                    dbError.message
                );

            }

        }

        res.json({
            ...weatherData,
            riskLevel,
            disasterType
        });

    } catch (error) {

        if (error.response) {

            console.error(
                "OpenWeather Error:",
                error.response.data
            );

        } else {

            console.error(
                "Weather Route Error:",
                error.message
            );

        }

        const statusCode =
            error.response?.status === 404 ? 404 :
                error.code === "ECONNABORTED" ? 504 :
                    502;

        res.status(statusCode).json({
            message:
                statusCode === 404
                    ? "City not found"
                    : statusCode === 504
                        ? "Weather service timed out"
                        : "Weather service temporarily unavailable"
        });
    }

});

module.exports = router;