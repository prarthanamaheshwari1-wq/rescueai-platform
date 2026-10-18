
const test = require("node:test");
const assert = require("node:assert/strict");
const sharp = require("sharp");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const {
    analyzeImageAuthenticity
} = require("../services/imageAuthenticity");

let imagePath;
let tempDir;

test.before(async () => {
    tempDir = await fs.mkdtemp(
        path.join(os.tmpdir(), "rescueai-image-test-")
    );

    imagePath = path.join(tempDir, "test-image.jpg");

    await sharp({
        create: {
            width: 10,
            height: 10,
            channels: 3,
            background: { r: 120, g: 120, b: 120 }
        }
    })
        .jpeg()
        .toFile(imagePath);
});

test.after(async () => {
    if (tempDir) {
        await fs.rm(tempDir, { recursive: true, force: true });
    }
});

test("REAL verdict requires manual review", async () => {
    const result = await analyzeImageAuthenticity(
        imagePath,
        async () => ({
            text: "VERDICT: REAL\nREASON: No strong visual indicators.\nLIMITATION: Preliminary screening only."
        })
    );

    assert.equal(result.prediction, "REAL");
    assert.equal(result.status, "no_strong_ai_indicators");
    assert.equal(result.manualReviewRequired, true);
});

test("FAKE verdict is flagged for manual review", async () => {
    const result = await analyzeImageAuthenticity(
        imagePath,
        async () => ({
            text: "VERDICT: FAKE\nREASON: Strong visual inconsistencies.\nLIMITATION: Preliminary screening only."
        })
    );

    assert.equal(result.prediction, "FAKE");
    assert.equal(result.status, "possible_ai_generated");
    assert.equal(result.manualReviewRequired, true);
});

test("UNCERTAIN verdict remains inconclusive", async () => {
    const result = await analyzeImageAuthenticity(
        imagePath,
        async () => ({
            text: "VERDICT: UNCERTAIN\nREASON: Evidence is ambiguous.\nLIMITATION: Preliminary screening only."
        })
    );

    assert.equal(result.prediction, "UNCERTAIN");
    assert.equal(result.status, "inconclusive");
    assert.equal(result.manualReviewRequired, true);
});

test("Malformed AI response remains inconclusive", async () => {
    const result = await analyzeImageAuthenticity(
        imagePath,
        async () => ({ text: "I cannot determine the image." })
    );

    assert.equal(result.prediction, "UNCERTAIN");
    assert.equal(result.status, "inconclusive");
    assert.equal(result.manualReviewRequired, true);
});

test("Unavailable AI response remains inconclusive", async () => {
    const result = await analyzeImageAuthenticity(
        imagePath,
        async () => ({
            needsManualReview: true,
            text: ""
        })
    );

    assert.equal(result.prediction, "UNCERTAIN");
    assert.equal(result.status, "inconclusive");
    assert.equal(result.manualReviewRequired, true);
});

test("Missing image path remains inconclusive", async () => {
    const result = await analyzeImageAuthenticity(
        null,
        async () => {
            throw new Error("AI should not be called");
        }
    );

    assert.equal(result.prediction, "UNCERTAIN");
    assert.equal(result.status, "inconclusive");
    assert.equal(result.manualReviewRequired, true);
});
