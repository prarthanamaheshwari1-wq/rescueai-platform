const { redisClient } = require("../config/redis");

async function checkLocationConsistency({
    locationName,
    latitude,
    longitude
}) {
    const reportedName = String(locationName || "").trim();
    const lat = Number(latitude);
    const lon = Number(longitude);

    if (
        !reportedName ||
        !Number.isFinite(lat) ||
        lat < -90 ||
        lat > 90 ||
        !Number.isFinite(lon) ||
        lon < -180 ||
        lon > 180
    ) {
        return {
            checked: false,
            consistent: false,
            message: "Location information is invalid or incomplete."
        };
    }

    const cacheKey = `location-consistency:${lat.toFixed(4)}:${lon.toFixed(4)}`;

    try {
        let data = null;

        if (redisClient.isReady) {
            const cachedResult = await redisClient.get(cacheKey);

            if (cachedResult) {
                data = JSON.parse(cachedResult);
            }
        }

        if (!data) {
            const url = new URL(
                "https://nominatim.openstreetmap.org/reverse"
            );

            url.search = new URLSearchParams({
                format: "jsonv2",
                lat: String(lat),
                lon: String(lon),
                zoom: "10",
                addressdetails: "1"
            }).toString();

            const response = await fetch(url, {
                headers: {
                    "User-Agent": "RescueAI-DisasterResponse/1.0"
                },
                signal: AbortSignal.timeout(5000)
            });

            if (!response.ok) {
                throw new Error(
                    `Geocoding service returned ${response.status}`
                );
            }

            data = await response.json();

            if (redisClient.isReady) {
                await redisClient.setEx(
                    cacheKey,
                    86400,
                    JSON.stringify(data)
                );
            }
        }

        const address = data.address || {};

        const knownLocationParts = [
            address.city,
            address.town,
            address.village,
            address.municipality,
            address.county,
            address.state,
            address.country
        ].filter(Boolean);

        if (knownLocationParts.length === 0) {
            return {
                checked: false,
                consistent: false,
                message: "The coordinates could not be matched to a known location."
            };
        }

        const normalizedReportedName = reportedName.toLowerCase();

        const consistent = knownLocationParts.some(part =>
            normalizedReportedName.includes(part.toLowerCase()) ||
            part.toLowerCase().includes(normalizedReportedName)
        );

        return {
            checked: true,
            consistent,
            message: consistent
                ? "The reported location matches a name returned for the coordinates."
                : "The reported location may not match the coordinates. Authority review is recommended."
        };
    } catch (error) {
        console.error(
            "Location Consistency Check Error:",
            error.message
        );

        return {
            checked: false,
            consistent: false,
            message: "Location consistency could not be verified. Authority review is recommended."
        };
    }
}

module.exports = {
    checkLocationConsistency
};
