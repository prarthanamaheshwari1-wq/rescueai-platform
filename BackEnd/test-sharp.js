const fs = require("fs");
const { processDisasterImage } = require("./services/imageProcessor");

async function testSharp() {

    try {

        const inputPath = "./test-image.png";

        if (!fs.existsSync(inputPath)) {

            console.log(
                "ERROR: test-image.png not found."
            );

            return;
        }

        console.log("Processing image with Sharp...");

        const outputPath =
            await processDisasterImage(inputPath);

        console.log(
            "Sharp processing successful!"
        );

        console.log(
            "Processed image:"
        );

        console.log(outputPath);

    } catch (error) {

        console.error(
            "Sharp processing failed:"
        );

        console.error(error.message);

    }

}

testSharp();