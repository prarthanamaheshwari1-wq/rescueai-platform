
const { test } = require("node:test");
const assert = require("node:assert/strict");

const {
    checkLocationConsistency
} = require("../services/locationConsistency");

test("Bareilly coordinates match the reported location", async () => {
    const result = await checkLocationConsistency({
        locationName: "Bareilly",
        latitude: 28.367,
        longitude: 79.430
    });

    assert.equal(result.checked, true);
    assert.equal(result.consistent, true);
});


test("Missing location name is rejected", async () => {
    const result = await checkLocationConsistency({
        locationName: "",
        latitude: 28.367,
        longitude: 79.430
    });

    assert.equal(result.checked, false);
    assert.equal(result.consistent, false);
});

test("Latitude outside valid range is rejected", async () => {
    const result = await checkLocationConsistency({
        locationName: "Bareilly",
        latitude: 91,
        longitude: 79.430
    });

    assert.equal(result.checked, false);
    assert.equal(result.consistent, false);
});

test("Longitude outside valid range is rejected", async () => {
    const result = await checkLocationConsistency({
        locationName: "Bareilly",
        latitude: 28.367,
        longitude: 181
    });

    assert.equal(result.checked, false);
    assert.equal(result.consistent, false);
});

test("Non-numeric coordinates are rejected", async () => {
    const result = await checkLocationConsistency({
        locationName: "Bareilly",
        latitude: "invalid",
        longitude: "invalid"
    });

    assert.equal(result.checked, false);
    assert.equal(result.consistent, false);
});
