
const test = require("node:test");
const assert = require("node:assert/strict");
const sharp = require("sharp");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const {
    analyzeImageAuthenticity,
    verifyImageSource
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

test("Missing SearchApi key returns unavailable", async () => {
    const originalKey = process.env.SEARCHAPI_API_KEY;
    delete process.env.SEARCHAPI_API_KEY;

    try {
        const result = await verifyImageSource(
            "https://example.com/image.jpg"
        );

        assert.equal(result.status, "unavailable");
        assert.equal(result.sourceMatched, false);
    } finally {
        if (originalKey === undefined) {
            delete process.env.SEARCHAPI_API_KEY;
        } else {
            process.env.SEARCHAPI_API_KEY = originalKey;
        }
    }
});

test("Invalid image URL returns unavailable", async () => {
    const result = await verifyImageSource(
        "C:/uploads/image.jpg"
    );

    assert.equal(result.status, "unavailable");
    assert.equal(result.sourceMatched, false);
});

test("Reverse-image matches are returned correctly", async () => {
    const originalKey = process.env.SEARCHAPI_API_KEY;
    const originalFetch = global.fetch;

    process.env.SEARCHAPI_API_KEY = "test-api-key";

    global.fetch = async () => ({
        ok: true,
        json: async () => ({
            visual_matches: [
                {
                    title: "Disaster image source",
                    source: "Example News",
                    link: "https://example.com/source"
                }
            ]
        })
    });

    try {
        const result = await verifyImageSource(
            "https://example.com/image.jpg"
        );

        assert.equal(result.status, "matches_found");
        assert.equal(result.sourceMatched, true);
        assert.equal(
            result.matchedSourceUrl,
            "https://example.com/source"
        );
        assert.equal(result.matches.length, 1);
    } finally {
        global.fetch = originalFetch;

        if (originalKey === undefined) {
            delete process.env.SEARCHAPI_API_KEY;
        } else {
            process.env.SEARCHAPI_API_KEY = originalKey;
        }
    }
});

test("No reverse-image matches returns no_matches_found", async () => {
    const originalKey = process.env.SEARCHAPI_API_KEY;
    const originalFetch = global.fetch;

    process.env.SEARCHAPI_API_KEY = "test-api-key";

    global.fetch = async () => ({
        ok: true,
        json: async () => ({
            visual_matches: []
        })
    });

    try {
        const result = await verifyImageSource(
            "https://example.com/image.jpg"
        );

        assert.equal(result.status, "no_matches_found");
        assert.equal(result.sourceMatched, false);
        assert.equal(result.matches.length, 0);
    } finally {
        global.fetch = originalFetch;

        if (originalKey === undefined) {
            delete process.env.SEARCHAPI_API_KEY;
        } else {
            process.env.SEARCHAPI_API_KEY = originalKey;
        }
    }
});

test("SearchApi failure returns unavailable without throwing", async () => {
    const originalKey = process.env.SEARCHAPI_API_KEY;
    const originalFetch = global.fetch;

    process.env.SEARCHAPI_API_KEY = "test-api-key";

    global.fetch = async () => {
        throw new Error("SearchApi unavailable");
    };

    try {
        const result = await verifyImageSource(
            "https://example.com/image.jpg"
        );

        assert.equal(result.status, "unavailable");
        assert.equal(result.sourceMatched, false);
    } finally {
        global.fetch = originalFetch;

        if (originalKey === undefined) {
            delete process.env.SEARCHAPI_API_KEY;
        } else {
            process.env.SEARCHAPI_API_KEY = originalKey;
        }
    }
});
