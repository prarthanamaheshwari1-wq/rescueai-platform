
const { test } = require("node:test");
const assert = require("node:assert/strict");

const {
    getAvailableResourceRecommendations
} = require("../services/resourcePlanner");

test("Nearby resources are ranked before farther resources", () => {
    const resources = [
        {
            Resource_id: 1,
            Resource_Type: "Vehicle",
            Quantity: 3,
            Status: "Available",
            Latitude: 28.400,
            Longitude: 79.500
        },
        {
            Resource_id: 2,
            Resource_Type: "Vehicle",
            Quantity: 2,
            Status: "Available",
            Latitude: 28.367,
            Longitude: 79.430
        }
    ];

    const recommendations = getAvailableResourceRecommendations(
        resources,
        ["Vehicle"],
        28.367,
        79.430
    );

    assert.deepEqual(
        recommendations[0].resources.map(resource => resource.Resource_id),
        [2, 1]
    );

    assert.equal(
        recommendations[0].resources[0].distanceKm,
        0
    );
});

test("Resources without coordinates remain included and rank last", () => {
    const resources = [
        {
            Resource_id: 1,
            Resource_Type: "Vehicle",
            Quantity: 1,
            Status: "Available",
            Latitude: null,
            Longitude: null
        },
        {
            Resource_id: 2,
            Resource_Type: "Vehicle",
            Quantity: 1,
            Status: "Available",
            Latitude: 28.367,
            Longitude: 79.430
        }
    ];

    const recommendations = getAvailableResourceRecommendations(
        resources,
        ["Vehicle"],
        28.367,
        79.430
    );

    assert.deepEqual(
        recommendations[0].resources.map(resource => resource.Resource_id),
        [2, 1]
    );

    assert.equal(
        recommendations[0].resources[1].distanceKm,
        null
    );
});

test("Unavailable and zero-quantity resources are excluded", () => {
    const resources = [
        {
            Resource_id: 1,
            Resource_Type: "Vehicle",
            Quantity: 0,
            Status: "Available",
            Latitude: 28.367,
            Longitude: 79.430
        },
        {
            Resource_id: 2,
            Resource_Type: "Vehicle",
            Quantity: 2,
            Status: "Deployed",
            Latitude: 28.367,
            Longitude: 79.430
        },
        {
            Resource_id: 3,
            Resource_Type: "Vehicle",
            Quantity: 1,
            Status: "Available",
            Latitude: 28.367,
            Longitude: 79.430
        }
    ];

    const recommendations = getAvailableResourceRecommendations(
        resources,
        ["Vehicle"],
        28.367,
        79.430
    );

    assert.deepEqual(
        recommendations[0].resources.map(resource => resource.Resource_id),
        [3]
    );
});

test("Missing incident coordinates do not exclude available resources", () => {
    const resources = [
        {
            Resource_id: 1,
            Resource_Type: "Vehicle",
            Quantity: 1,
            Status: "Available",
            Latitude: 28.367,
            Longitude: 79.430
        }
    ];

    const recommendations = getAvailableResourceRecommendations(
        resources,
        ["Vehicle"],
        null,
        null
    );

    assert.equal(recommendations.length, 1);
    assert.equal(recommendations[0].resources.length, 1);
    assert.equal(recommendations[0].resources[0].distanceKm, null);
});
