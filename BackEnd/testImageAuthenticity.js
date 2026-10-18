require("dotenv").config({
    path: require("path").join(__dirname, ".env")
});

const path = require("path");
const {
    analyzeImageAuthenticity
} = require("./services/imageAuthenticity");

async function testDetector() {
    const imagePath = process.argv[2];

    if (!imagePath) {
        console.log(
            "Usage: node testImageAuthenticity.js <path-to-image>"
        );
        process.exitCode = 1;
        return;
    }

    const absoluteImagePath = path.resolve(imagePath);

    console.log("Testing image:", absoluteImagePath);
    console.log("Loading detector; first run may take longer...\n");

    const result = await analyzeImageAuthenticity(absoluteImagePath);

    console.log("\nDetection result:");
    console.dir(result, { depth: null });
}

testDetector().catch((error) => {
    console.error("Test failed:", error.message);
    process.exitCode = 1;
});