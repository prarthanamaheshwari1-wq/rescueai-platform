
const test = require("node:test");
const assert = require("node:assert/strict");
const sharp = require("sharp");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
    generateImageHash,
    generatePerceptualHash,
    generateCropRegionHashes
} = require("../services/imageDuplicateDetection");

test("image fingerprints are valid 64-bit hexadecimal hashes", async () => {
    const temporaryDirectory = fs.mkdtempSync(
        path.join(os.tmpdir(), "rescueai-image-test-")
    );

    const imagePath = path.join(
        temporaryDirectory,
        "synthetic-image.png"
    );

    try {
        const width = 64;
        const height = 64;
        const pixels = Buffer.alloc(width * height);

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                pixels[y * width + x] = (x * 3 + y * 2) % 256;
            }
        }

        await sharp(pixels, {
            raw: {
                width,
                height,
                channels: 1
            }
        })
            .png()
            .toFile(imagePath);

        const differenceHash = await generateImageHash(imagePath);
        const perceptualHash = await generatePerceptualHash(imagePath);

        assert.match(differenceHash, /^[0-9a-f]{16}$/);
        assert.match(perceptualHash, /^[0-9a-f]{16}$/);

        assert.equal(
            await generateImageHash(imagePath),
            differenceHash,
            "dHash should be repeatable for the same image"
        );

        assert.equal(
            await generatePerceptualHash(imagePath),
            perceptualHash,
            "pHash should be repeatable for the same image"
        );
    } finally {
        fs.rmSync(temporaryDirectory, {
            recursive: true,
            force: true
        });
    }
});

test("crop fingerprint generation returns 48 region hashes", async () => {
    const temporaryDirectory = fs.mkdtempSync(
        path.join(os.tmpdir(), "rescueai-crop-test-")
    );

    const imagePath = path.join(
        temporaryDirectory,
        "synthetic-image.png"
    );

    try {
        const width = 100;
        const height = 100;
        const pixels = Buffer.alloc(width * height);

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                pixels[y * width + x] = (x * 5 + y * 7) % 256;
            }
        }

        await sharp(pixels, {
            raw: {
                width,
                height,
                channels: 1
            }
        })
            .png()
            .toFile(imagePath);

        const regions = await generateCropRegionHashes(imagePath);

        assert.equal(regions.length, 48);

        for (const region of regions) {
            assert.match(region.hash, /^[0-9a-f]{16}$/);
            assert.ok(region.scale > 0);
            assert.ok(region.scale <= 1);
        }
    } finally {
        fs.rmSync(temporaryDirectory, {
            recursive: true,
            force: true
        });
    }
});
