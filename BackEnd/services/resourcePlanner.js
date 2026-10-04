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


function getAvailableResourceRecommendations(resources, recommendedTypes) {

    return recommendedTypes.map(type => {

        const matchingResources = resources.filter(
            resource =>
                String(resource.Resource_Type || "").trim().toLowerCase() ===
                String(type || "").trim().toLowerCase()
        );

        const availableResources = matchingResources.filter(
            resource =>
                Number(resource.Quantity || 0) > 0
        );

        return {
            resourceType: type,
            resources: availableResources
        };
    });
}


async function getResourceRecommendations(category, severity) {

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
    `;

    return getAvailableResourceRecommendations(
        result.recordset,
        recommendedTypes
    );
}


module.exports = {
    getRecommendedResourceTypes,
    getAvailableResourceRecommendations,
    getResourceRecommendations
};