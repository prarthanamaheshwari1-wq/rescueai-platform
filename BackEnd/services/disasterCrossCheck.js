
const axios = require("axios");
const { sql } = require("../config/db");

/**
 * Cross-checks submitted emergency reports against weather data
 * and potentially relevant active disaster alerts.
 * External verification failures never block report submission.
 */
async function crossCheckDisasterSource({
    category,
    locationName,
    latitude,
    longitude
}) {
    const unavailableResult = (message) => ({
        status: "unavailable",
        sourceName: "External Disaster & Weather Feeds",
        sourceUrl: null,
        matchedAlert: null,
        message,
        timestamp: new Date().toISOString()
    });

    try {
        const apiKey = process.env.OPENWEATHER_API_KEY;

        if (!apiKey) {
            return unavailableResult(
                "External weather cross-checking is unavailable (API key not configured)."
            );
        }

        // 1. Fetch live weather data
        let weatherUrl =
            `https://api.openweathermap.org/data/2.5/weather?appid=${apiKey}&units=metric`;

        if (
            Number.isFinite(latitude) &&
            Number.isFinite(longitude)
        ) {
            weatherUrl += `&lat=${latitude}&lon=${longitude}`;
        } else if (
            typeof locationName === "string" &&
            locationName.trim()
        ) {
            weatherUrl += `&q=${encodeURIComponent(locationName.trim())}`;
        } else {
            return unavailableResult(
                "Insufficient location data provided for external cross-checking."
            );
        }

        const weatherResponse = await axios.get(weatherUrl, {
            timeout: 10000
        });

        const weather = weatherResponse.data;

        const weatherCondition =
            weather.weather?.[0]?.main || "";

        const weatherDescription =
            weather.weather?.[0]?.description || "";

        const windSpeed = weather.wind?.speed || 0;
        const temp = weather.main?.temp || 0;

        // 2. Fetch active alerts only when a location is available
        let activeAlerts = [];

        if (
            typeof locationName === "string" &&
            locationName.trim()
        ) {
            const alertRequest = new sql.Request();

            alertRequest.input(
                "LocationName",
                sql.NVarChar,
                locationName.trim()
            );

            const dbAlerts = await alertRequest.query(`
                SELECT TOP 5
                    Title,
                    Description,
                    Severity,
                    Alert_Type,
                    Created_At
                FROM Alerts
                WHERE LOWER(Location_Name)
                    LIKE '%' + LOWER(@LocationName) + '%'
                  AND UPPER(Status) = 'ACTIVE'
            `).catch(() => ({ recordset: [] }));

            activeAlerts = dbAlerts.recordset || [];
        }

        // 3. Evaluate weather and alert consistency
        const catLower = String(category || "").toLowerCase();

        let matchesAlert = false;
        let matchDetails = "";
        let matchedAlertTitle = null;

        const conditionLower = weatherCondition.toLowerCase();

        // Flood-related weather evidence
        if (
            catLower.includes("flood") &&
            (
                conditionLower.includes("rain") ||
                conditionLower.includes("drizzle") ||
                conditionLower.includes("thunderstorm")
            )
        ) {
            matchesAlert = true;

            matchDetails =
                `Precipitation-related weather conditions (${weatherDescription}) may be relevant to the reported flood. This does not independently confirm flooding.`;
        }

        // Storm-related weather evidence
        else if (
            catLower.includes("storm") &&
            (
                windSpeed >= 15 ||
                conditionLower.includes("storm")
            )
        ) {
            matchesAlert = true;

            matchDetails =
                `Weather conditions (wind speed ${windSpeed} m/s, ${weatherDescription}) may be relevant to the reported storm.`;
        }

        // Heat-related weather evidence
        else if (
            catLower.includes("heat") &&
            temp >= 38
        ) {
            matchesAlert = true;

            matchDetails =
                `High temperature recorded (${temp}°C) may be relevant to the reported heat incident.`;
        }

        // 4. Match active alerts against the reported category
        if (!matchesAlert && activeAlerts.length > 0) {
            const categoryKeywords = {
                flood: [
                    "flood",
                    "flooding",
                    "waterlogging"
                ],
                fire: [
                    "fire",
                    "wildfire",
                    "blaze"
                ],
                earthquake: [
                    "earthquake",
                    "seismic"
                ],
                landslide: [
                    "landslide",
                    "mudslide"
                ],
                storm: [
                    "storm",
                    "cyclone",
                    "thunderstorm"
                ],
                accident: [
                    "accident",
                    "collision",
                    "crash"
                ],
                heat: [
                    "heatwave",
                    "extreme heat"
                ]
            };

            const categoryKey = Object.keys(categoryKeywords)
                .find(key => catLower.includes(key));

            const keywords = categoryKey
                ? categoryKeywords[categoryKey]
                : [];

            const matchingAlert = activeAlerts.find(alert => {
                const alertText = [
                    alert.Alert_Type,
                    alert.Title,
                    alert.Description
                ]
                    .filter(Boolean)
                    .join(" ")
                    .toLowerCase();

                return keywords.some(keyword =>
                    alertText.includes(keyword)
                );
            });

            if (matchingAlert) {
                matchesAlert = true;
                matchedAlertTitle = matchingAlert.Title;

                matchDetails =
                    `A potentially relevant active alert was found: ${matchingAlert.Title}.`;
            }
        }

        // 5. Return cross-check result
        if (matchesAlert) {
            return {
                status: "supporting_evidence",
                sourceName: "OpenWeatherMap & RescueAI Alerts",
                sourceUrl: "https://openweathermap.org/",
                matchedAlert:
                    matchedAlertTitle || weatherCondition,
                message:
                    `Trusted source cross-check found potentially relevant evidence. ${matchDetails}`,
                timestamp: new Date().toISOString()
            };
        }

        return {
            status: "no_direct_correlation",
            sourceName: "OpenWeatherMap & RescueAI Alerts",
            sourceUrl: "https://openweathermap.org/",
            matchedAlert: null,
            message:
                `No immediate weather warning or severe condition (Condition: ${weatherCondition}, Temp: ${temp}°C) directly matches this category, but this does not prove the incident is false.`,
            timestamp: new Date().toISOString()
        };

    } catch (error) {
        console.error(
            "Disaster Cross-Check Error:",
            error.message
        );

        return unavailableResult(
            "External disaster and weather verification service is temporarily unavailable."
        );
    }
}

module.exports = {
    crossCheckDisasterSource
};
