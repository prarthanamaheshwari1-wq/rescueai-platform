const { sql } = require("../config/db");


function getRecommendedResourceTypes(category, severity) {

    const recommendations = [];

    const normalizedCategory =
        String(category || "").trim().toLowerCase();

    const normalizedSeverity =
        String(severity || "").trim().toLowerCase();


    // FLOOD
    if (normalizedCategory === "flood") {

        recommendations.push("Vehicle");

        if (
            normalizedSeverity === "medium" ||
            normalizedSeverity === "high" ||
            normalizedSeverity === "critical"
        ) {
            recommendations.push("Medical");
        }

        if (normalizedSeverity === "critical") {
            recommendations.push("Fire Engine");
        }
    }


    // FIRE
    else if (normalizedCategory === "fire") {

        recommendations.push("Fire Engine");

        if (
            normalizedSeverity === "medium" ||
            normalizedSeverity === "high" ||
            normalizedSeverity === "critical"
        ) {
            recommendations.push("Vehicle");
        }

        if (
            normalizedSeverity === "high" ||
            normalizedSeverity === "critical"
        ) {
            recommendations.push("Medical");
        }
    }


    // EARTHQUAKE
    else if (normalizedCategory === "earthquake") {

        recommendations.push("Vehicle");

        if (
            normalizedSeverity === "medium" ||
            normalizedSeverity === "high" ||
            normalizedSeverity === "critical"
        ) {
            recommendations.push("Medical");
        }

        if (
            normalizedSeverity === "high" ||
            normalizedSeverity === "critical"
        ) {
            recommendations.push("Fire Engine");
        }
    }


    // DEFAULT
    else {

        recommendations.push("Vehicle");

        if (
            normalizedSeverity === "high" ||
            normalizedSeverity === "critical"
        ) {
            recommendations.push("Medical");
        }
    }


    return recommendations;
}


function calculateDistanceKm(lat1, lon1, lat2, lon2) {
    const toRadians = degrees => degrees * (Math.PI / 180);

    const latitudeDifference = toRadians(lat2 - lat1);
    const longitudeDifference = toRadians(lon2 - lon1);

    const a =
        Math.sin(latitudeDifference / 2) ** 2 +
        Math.cos(toRadians(lat1)) *
        Math.cos(toRadians(lat2)) *
        Math.sin(longitudeDifference / 2) ** 2;

    const centralAngle = 2 * Math.atan2(
        Math.sqrt(a),
        Math.sqrt(1 - a)
    );

    return 6371 * centralAngle;
}

function getAvailableResourceRecommendations(
    resources,
    recommendedTypes,
    incidentLatitude,
    incidentLongitude
) {
    const hasIncidentCoordinates =
        Number.isFinite(Number(incidentLatitude)) &&
        Number.isFinite(Number(incidentLongitude)) &&
        incidentLatitude !== null &&
        incidentLongitude !== null &&
        String(incidentLatitude).trim() !== "" &&
        String(incidentLongitude).trim() !== "";

    return recommendedTypes
        .map(type => {
            const matchingResources = resources
                .filter(resource =>
                    String(resource.Resource_Type || "").trim().toLowerCase() ===
                    String(type || "").trim().toLowerCase()
                )
                .filter(resource =>
                    Number(resource.Quantity || 0) > 0 &&
                    String(resource.Status || "").trim().toLowerCase() ===
                    "available"
                )
                .map(resource => {
                    const latitude = Number(resource.Latitude);
                    const longitude = Number(resource.Longitude);

                    const hasResourceCoordinates =
                        resource.Latitude !== null &&
                        resource.Latitude !== undefined &&
                        resource.Longitude !== null &&
                        resource.Longitude !== undefined &&
                        String(resource.Latitude).trim() !== "" &&
                        String(resource.Longitude).trim() !== "" &&
                        Number.isFinite(latitude) &&
                        Number.isFinite(longitude);

                    const distanceKm =
                        hasIncidentCoordinates && hasResourceCoordinates
                            ? calculateDistanceKm(
                                Number(incidentLatitude),
                                Number(incidentLongitude),
                                latitude,
                                longitude
                            )
                            : null;

                    return {
                        ...resource,
                        distanceKm
                    };
                });

            matchingResources.sort((a, b) => {
                if (a.distanceKm === null) return 1;
                if (b.distanceKm === null) return -1;

                return a.distanceKm - b.distanceKm;
            });

            return {
                resourceType: type,
                resources: matchingResources
            };
        })
        .filter(recommendation =>
            recommendation.resources.length > 0
        );
}
async function getResourceRecommendations(
    category,
    severity,
    incidentLatitude,
    incidentLongitude
) {

    const recommendedTypes =
        getRecommendedResourceTypes(category, severity);

    const result = await sql.query`
        SELECT
            Resource_id,
            Resource_Name,
            Resource_Type,
            Quantity,
            Location_Name,
            Latitude,
            Longitude,
            Status
        FROM Resources
        WHERE Quantity > 0
            AND LOWER(LTRIM(RTRIM(Status))) = 'available'
    `;

    return getAvailableResourceRecommendations(
        result.recordset,
        recommendedTypes,
        incidentLatitude,
        incidentLongitude
    );
}


module.exports = {
    getRecommendedResourceTypes,
    getAvailableResourceRecommendations,
    getResourceRecommendations
};