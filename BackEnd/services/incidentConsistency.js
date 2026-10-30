
const VALID_CATEGORIES = [
    "flood",
    "fire",
    "earthquake",
    "accident",
    "landslide",
    "storm",
    "other"
];

function checkIncidentConsistency({
    category,
    description,
    locationName,
    latitude,
    longitude,
    aiVisualFindings
}) {
    const warnings = [];

    const normalizedCategory = String(category || "")
        .trim()
        .toLowerCase();

    const normalizedDescription = String(description || "")
        .trim();

    const normalizedLocation = String(locationName || "")
        .trim();

    const lat = Number(latitude);
    const lon = Number(longitude);

    const visualFindings = String(aiVisualFindings || "")
        .trim();

    // Check whether the category is recognized by this service.
    if (!VALID_CATEGORIES.includes(normalizedCategory)) {
        warnings.push({
            type: "CATEGORY_REVIEW",
            message:
                "The incident category is not recognized by the consistency checker. Authority review is recommended."
        });
    }


    // Check whether the description contains indicators
    // that conflict with the selected incident category.
    const categoryKeywords = {
        flood: ["flood", "flooding", "inundat", "water level", "submerged"],
        fire: ["fire", "burning", "flames", "smoke", "blaze"],
        earthquake: ["earthquake", "tremor", "seismic", "ground shaking"],
        accident: ["accident", "collision", "crash", "vehicle"],
        landslide: ["landslide", "mudslide", "rockfall"],
        storm: ["storm", "cyclone", "hurricane", "tornado", "strong winds"]
    };

    if (categoryKeywords[normalizedCategory]) {
        const descriptionText = normalizedDescription.toLowerCase();

        const matchesCategory = categoryKeywords[normalizedCategory]
            .some(keyword => descriptionText.includes(keyword));

        const mentionsAnotherCategory = Object.entries(categoryKeywords)
            .some(([otherCategory, keywords]) =>
                otherCategory !== normalizedCategory &&
                keywords.some(keyword => descriptionText.includes(keyword))
            );

        if (!matchesCategory && mentionsAnotherCategory) {
            warnings.push({
                type: "CATEGORY_DESCRIPTION_MISMATCH",
                message:
                    "The incident description may not match the selected category. Authority review is recommended."
            });
        }
    }



    // Flag possible conflicts between the selected category
    // and the AI-generated visual findings.
    if (categoryKeywords[normalizedCategory] && visualFindings) {
        const visualText = visualFindings.toLowerCase();

        const visualMatchesCategory = categoryKeywords[normalizedCategory]
            .some(keyword => visualText.includes(keyword));

        const visualMentionsAnotherCategory = Object.entries(categoryKeywords)
            .some(([otherCategory, keywords]) =>
                otherCategory !== normalizedCategory &&
                keywords.some(keyword => visualText.includes(keyword))
            );

        if (!visualMatchesCategory && visualMentionsAnotherCategory) {
            warnings.push({
                type: "VISUAL_CATEGORY_MISMATCH",
                message:
                    "The AI visual findings may conflict with the selected incident category. Authority review is recommended."
            });
        }
    }



    // Check that location information is present and coordinates are valid.
    if (
        !normalizedLocation ||
        !Number.isFinite(lat) ||
        lat < -90 ||
        lat > 90 ||
        !Number.isFinite(lon) ||
        lon < -180 ||
        lon > 180
    ) {
        warnings.push({
            type: "LOCATION_REVIEW",
            message:
                "The reported location or coordinates could not be validated."
        });
    }

    // Flag reports where the description or visual assessment is missing.
    if (!normalizedDescription || !visualFindings) {
        warnings.push({
            type: "INSUFFICIENT_EVIDENCE",
            message:
                "There is insufficient incident information to assess consistency reliably."
        });
    }

    return {
        reviewRecommended: warnings.length > 0,
        warnings
    };
}

module.exports = {
    checkIncidentConsistency
};
