
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
