
const test = require("node:test");
const assert = require("node:assert/strict");

const {
    checkIncidentConsistency
} = require("../services/incidentConsistency");

test("valid incident information does not require review", () => {
    const result = checkIncidentConsistency({
        category: "flood",
        description: "Heavy flooding on the road",
        locationName: "Bareilly",
        latitude: 28.367,
        longitude: 79.430,
        aiVisualFindings: "Floodwater visible on the road"
    });

    assert.equal(result.reviewRecommended, false);
    assert.deepEqual(result.warnings, []);
});

test("invalid category, location, and missing evidence require review", () => {
    const result = checkIncidentConsistency({
        category: "unknown-event",
        description: "",
        locationName: "",
        latitude: 200,
        longitude: 300,
        aiVisualFindings: ""
    });

    assert.equal(result.reviewRecommended, true);

    assert.deepEqual(
        result.warnings.map(warning => warning.type),
        [
            "CATEGORY_REVIEW",
            "LOCATION_REVIEW",
            "INSUFFICIENT_EVIDENCE"
        ]
    );
});

test("conflicting AI visual findings recommend authority review", () => {
    const result = checkIncidentConsistency({
        category: "flood",
        description: "Heavy flooding on the road",
        locationName: "Bareilly",
        latitude: 28.367,
        longitude: 79.430,
        aiVisualFindings: "Fire and flames are visible at the scene"
    });

    assert.equal(result.reviewRecommended, true);

    assert.ok(
        result.warnings.some(
            warning => warning.type === "VISUAL_CATEGORY_MISMATCH"
        )
    );
});