
const sharp = require("sharp");
const { sql } = require("../config/db");


/**
 * Generate a 64-bit difference hash (dHash).
 * Similar images generally have a small Hamming distance.
 */
async function generateImageHash(imagePath) {
    const pixels = await sharp(imagePath)
        .rotate()
        .resize(9, 8, {
            fit: "fill"
        })
        .greyscale()
        .raw()
        .toBuffer();

    let hash = 0n;
    let bit = 0n;

    for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
            const left = pixels[y * 9 + x];
            const right = pixels[y * 9 + x + 1];

            if (left > right) {
                hash |= 1n << bit;
            }

            bit++;
        }
    }

    return hash.toString(16).padStart(16, "0");
}

function hammingDistance(hashA, hashB) {
    let value = BigInt("0x" + hashA) ^ BigInt("0x" + hashB);
    let count = 0;

    while (value > 0n) {
        count += Number(value & 1n);
        value >>= 1n;
    }

    return count;
}

/**
 * Compare the new image against fingerprints of previous reports.
 * A possible match is flagged for authority review, never auto-rejected.
 */
async function checkImageDuplicate(imagePath, reportId) {
    const imageHash = await generateImageHash(imagePath);
    const request = new sql.Request();

    request.input("ReportId", sql.Int, reportId);

    const result = await request.query(`
        SELECT Report_id, Image_Hash
        FROM dbo.Image_Duplicate_Checks
        WHERE Report_id < @ReportId
    `);

    let closestMatch = null;

    for (const row of result.recordset) {
        const existingHash = String(row.Image_Hash || "")
            .trim()
            .toLowerCase();

        if (!/^[0-9a-f]{16}$/.test(existingHash)) {
            continue;
        }

        const distance = hammingDistance(imageHash, existingHash);

        if (!closestMatch || distance < closestMatch.distance) {
            closestMatch = {
                reportId: row.Report_id,
                distance
            };
        }
    }

    // Initial threshold; we'll validate it with test images.
    const threshold = 8;
    const isPossibleDuplicate =
        closestMatch !== null &&
        closestMatch.distance <= threshold;

    const saveRequest = new sql.Request();

    saveRequest.input("ReportId", sql.Int, reportId);
    saveRequest.input("ImageHash", sql.Char(16), imageHash);
    saveRequest.input(
        "SimilarReportId",
        sql.Int,
        isPossibleDuplicate ? closestMatch.reportId : null
    );
    saveRequest.input(
        "HammingDistance",
        sql.Int,
        closestMatch ? closestMatch.distance : null
    );
    saveRequest.input(
        "IsPossibleDuplicate",
        sql.Bit,
        isPossibleDuplicate
    );

    await saveRequest.query(`
        MERGE dbo.Image_Duplicate_Checks AS target
        USING (
            SELECT
                @ReportId AS Report_id,
                @ImageHash AS Image_Hash,
                @SimilarReportId AS Similar_Report_id,
                @HammingDistance AS Hamming_Distance,
                @IsPossibleDuplicate AS Is_Possible_Duplicate
        ) AS source
        ON target.Report_id = source.Report_id
        WHEN MATCHED THEN
            UPDATE SET
                Image_Hash = source.Image_Hash,
                Similar_Report_id = source.Similar_Report_id,
                Hamming_Distance = source.Hamming_Distance,
                Is_Possible_Duplicate = source.Is_Possible_Duplicate,
                Checked_At = SYSUTCDATETIME()
        WHEN NOT MATCHED THEN
            INSERT (
                Report_id,
                Image_Hash,
                Similar_Report_id,
                Hamming_Distance,
                Is_Possible_Duplicate
            )
            VALUES (
                source.Report_id,
                source.Image_Hash,
                source.Similar_Report_id,
                source.Hamming_Distance,
                source.Is_Possible_Duplicate
            );
    `);

    return {
        checkCompleted: true,
        isPossibleDuplicate,
        similarReportId: isPossibleDuplicate
            ? closestMatch.reportId
            : null,
        hammingDistance: closestMatch
            ? closestMatch.distance
            : null
    };
}

module.exports = {
    generateImageHash,
    checkImageDuplicate
};
