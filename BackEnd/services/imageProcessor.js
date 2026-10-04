const sharp = require("sharp");
const path = require("path");

async function processDisasterImage(inputPath) {

    const outputPath =
        path.join(
            path.dirname(inputPath),
            "processed-" +
            path.basename(
                inputPath,
                path.extname(inputPath)
            ) +
            ".jpg"
        );

    await sharp(inputPath)
        .rotate()
        .resize({
            width: 1600,
            height: 1600,
            fit: "inside",
            withoutEnlargement: true
        })
        .jpeg({
            quality: 85
        })
        .toFile(outputPath);

    return outputPath;
}

module.exports = {
    processDisasterImage
};