
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");
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


/**
 * Generate a 64-bit perceptual hash (pHash) using DCT.
 * Designed to recognize visually similar images despite
 * resizing, compression and moderate image changes.
 */
async function generatePerceptualHash(imagePath) {
    const size = 32;
    const pixels = await sharp(imagePath)
        .rotate()
        .resize(size, size, {
            fit: "fill"
        })
        .greyscale()
        .raw()
        .toBuffer();

    const dct = Array.from({ length: 8 }, () =>
        new Array(8).fill(0)
    );

    for (let v = 0; v < 8; v++) {
        for (let u = 0; u < 8; u++) {
            let sum = 0;

            for (let y = 0; y < size; y++) {
                for (let x = 0; x < size; x++) {
                    const pixel = pixels[y * size + x];

                    sum += pixel *
                        Math.cos(((2 * x + 1) * u * Math.PI) / (2 * size)) *
                        Math.cos(((2 * y + 1) * v * Math.PI) / (2 * size));
                }
            }

            dct[v][u] = sum;
        }
    }

    const coefficients = [];

    for (let v = 0; v < 8; v++) {
        for (let u = 0; u < 8; u++) {
            if (u === 0 && v === 0) continue;
            coefficients.push(dct[v][u]);
        }
    }

    const sorted = [...coefficients].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];

    let hash = 0n;
    let bit = 0n;

    for (let v = 0; v < 8; v++) {
        for (let u = 0; u < 8; u++) {
            if (dct[v][u] > median) {
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
 * Generate local dHash fingerprints from overlapping image regions.
 * Diagnostic only: this does not change production duplicate decisions.
 */

async function generateCropRegionHashes(imagePath) {
    // Decode and auto-rotate the image only once.
    const { data, info } = await sharp(imagePath)
        .rotate()
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

    const width = info.width;
    const height = info.height;
    const channels = info.channels;

    const scales = [0.45, 0.60, 0.75];
    const positions = [0, 0.25, 0.50, 0.75];

    const regions = [];

    for (const scale of scales) {
        const cropWidth = Math.max(9, Math.round(width * scale));
        const cropHeight = Math.max(8, Math.round(height * scale));

        for (const yPosition of positions) {
            for (const xPosition of positions) {
                const left = Math.min(
                    Math.round((width - cropWidth) * xPosition),
                    width - cropWidth
                );

                const top = Math.min(
                    Math.round((height - cropHeight) * yPosition),
                    height - cropHeight
                );

                const pixels = await sharp(data, {
                    raw: { width, height, channels }
                })
                    .extract({
                        left,
                        top,
                        width: cropWidth,
                        height: cropHeight
                    })
                    .resize(9, 8, { fit: "fill" })
                    .greyscale()
                    .raw()
                    .toBuffer();

                let hash = 0n;
                let bit = 0n;

                for (let row = 0; row < 8; row++) {
                    for (let column = 0; column < 8; column++) {
                        if (
                            pixels[row * 9 + column] >
                            pixels[row * 9 + column + 1]
                        ) {
                            hash |= 1n << bit;
                        }

                        bit++;
                    }
                }

                regions.push({
                    scale,
                    x: xPosition,
                    y: yPosition,
                    hash: hash.toString(16).padStart(16, "0")
                });
            }
        }
    }

    return regions;
}


function compareCropRegionHashes(regionsA, regionsB) {
    const matches = [];

    for (const regionA of regionsA) {
        for (const regionB of regionsB) {
            const distance = hammingDistance(
                regionA.hash,
                regionB.hash
            );

            if (distance <= 8) {
                matches.push({
                    distance,
                    regionA,
                    regionB
                });
            }
        }
    }

    matches.sort((a, b) => a.distance - b.distance);

    function regionBox(region) {
        const size = region.scale;
        const left = (1 - size) * region.x;
        const top = (1 - size) * region.y;
        return {
            left,
            top,
            right: left + size,
            bottom: top + size,
            area: size * size
        };
    }

    function computeIoU(region1, region2) {
        const box1 = regionBox(region1);
        const box2 = regionBox(region2);
        const interLeft = Math.max(box1.left, box2.left);
        const interTop = Math.max(box1.top, box2.top);
        const interRight = Math.min(box1.right, box2.right);
        const interBottom = Math.min(box1.bottom, box2.bottom);

        if (interRight <= interLeft || interBottom <= interTop) {
            return 0;
        }

        const interArea = (interRight - interLeft) * (interBottom - interTop);
        const unionArea = box1.area + box2.area - interArea;
        return unionArea > 0 ? interArea / unionArea : 0;
    }

    function selectDistinctRegions(matchList, getRegion, iouThreshold = 0.5) {
        const selected = [];
        for (const match of matchList) {
            const candidate = getRegion(match);
            const overlapsExisting = selected.some(
                existing => computeIoU(existing, candidate) > iouThreshold
            );
            if (!overlapsExisting) {
                selected.push(candidate);
            }
        }
        return selected;
    }

    const distinctRegionsA = selectDistinctRegions(
        matches,
        m => m.regionA
    );
    const distinctRegionsB = selectDistinctRegions(
        matches,
        m => m.regionB
    );
    const distinctStrongMatches = selectDistinctRegions(
        matches.filter(m => m.distance <= 5),
        m => m.regionA
    );

    function regionCenter(region) {
        const size = region.scale;
        const left = (1 - size) * region.x;
        const top = (1 - size) * region.y;
        return {
            cx: left + size / 2,
            cy: top + size / 2
        };
    }

    const deltas = matches.map(m => {
        const centerA = regionCenter(m.regionA);
        const centerB = regionCenter(m.regionB);
        return {
            dx: centerB.cx - centerA.cx,
            dy: centerB.cy - centerA.cy
        };
    });

    const maxOffsetDelta = 0.25;
    let maxConsistentPairs = 0;

    for (let i = 0; i < deltas.length; i++) {
        let consistentCount = 0;
        for (let j = 0; j < deltas.length; j++) {
            const dist = Math.hypot(
                deltas[i].dx - deltas[j].dx,
                deltas[i].dy - deltas[j].dy
            );
            if (dist <= maxOffsetDelta) {
                consistentCount++;
            }
        }
        if (consistentCount > maxConsistentPairs) {
            maxConsistentPairs = consistentCount;
        }
    }

    const hasGeometricConsistency =
        matches.length === 0 || maxConsistentPairs >= 2;

    const nonTrivialShifts = deltas.filter(
        d => Math.hypot(d.dx, d.dy) >= 0.05
    );

    const distinctNearStrongMatches = selectDistinctRegions(
        matches.filter(m => m.distance <= 6),
        m => m.regionA
    );

    const hasValidSpatialEvidence = nonTrivialShifts.length >= 2;

    const meetsStrongMatchCriteria =
        distinctStrongMatches.length >= 2 ||
        (distinctNearStrongMatches.length >= 2 && maxConsistentPairs >= 4);

    const bestHamming = matches.length ? matches[0].distance : null;
    const isLikelyGridCoincidence =
        matches.length >= 25 &&
        maxConsistentPairs >= 25 &&
        bestHamming !== null &&
        bestHamming <= 1;

    return {
        matchingRegionPairs: matches.length,
        uniqueMatchingRegionsA: distinctRegionsA.length,
        uniqueMatchingRegionsB: distinctRegionsB.length,
        strongMatchingPairs: distinctStrongMatches.length,
        consistentDisplacementPairs: maxConsistentPairs,
        bestDistance: bestHamming,
        isPossibleCropMatch:
            !isLikelyGridCoincidence &&
            distinctRegionsA.length >= 2 &&
            distinctRegionsB.length >= 2 &&
            meetsStrongMatchCriteria &&
            hasGeometricConsistency &&
            hasValidSpatialEvidence,
        bestMatches: matches.slice(0, 10)
    };
}




/**
 * Find close local-region matches between two images.
 * Returns diagnostic information only.
 */

async function compareCropRegions(imagePathA, imagePathB) {
    const regionsA = await generateCropRegionHashes(imagePathA);
    const regionsB = await generateCropRegionHashes(imagePathB);

    return {
        regionsCompared: regionsA.length + regionsB.length,
        ...compareCropRegionHashes(regionsA, regionsB)
    };
}



/**
 * Compare the new image against fingerprints of previous reports.
 * A possible match is flagged for authority review, never auto-rejected.
 */
async function checkImageDuplicate(imagePath, reportId) {
    const imageHash = await generateImageHash(imagePath);
    const perceptualHash = await generatePerceptualHash(imagePath);
    const request = new sql.Request();

    request.input("ReportId", sql.Int, reportId);

    const result = await request.query(`
    SELECT
        DC.Report_id,
        DC.Image_Hash,
        DC.Perceptual_Hash,
        IR.Photo_Path
    FROM dbo.Image_Duplicate_Checks DC
    INNER JOIN dbo.Incident_Reports IR
        ON IR.Report_id = DC.Report_id
    WHERE DC.Report_id < @ReportId
      AND IR.Photo_Path IS NOT NULL
`);

    let closestDHashMatch = null;
    let closestPHashMatch = null;
    let closestCropMatch = null;

    // Generate the current image's crop fingerprints only once.
    const currentCropHashes = await generateCropRegionHashes(imagePath);

    for (const row of result.recordset) {
        const existingDHash = String(row.Image_Hash || "")
            .trim()
            .toLowerCase();

        if (/^[0-9a-f]{16}$/.test(existingDHash)) {
            const distance = hammingDistance(imageHash, existingDHash);

            if (!closestDHashMatch || distance < closestDHashMatch.distance) {
                closestDHashMatch = {
                    reportId: row.Report_id,
                    distance
                };
            }
        }

        const existingPHash = String(row.Perceptual_Hash || "")
            .trim()
            .toLowerCase();

        if (/^[0-9a-f]{16}$/.test(existingPHash)) {
            const distance = hammingDistance(perceptualHash, existingPHash);

            if (!closestPHashMatch || distance < closestPHashMatch.distance) {
                closestPHashMatch = {
                    reportId: row.Report_id,
                    distance
                };
            }
        }

        // Compare local image regions to detect cropped versions.
        const previousImagePath = path.isAbsolute(row.Photo_Path)
            ? row.Photo_Path
            : path.resolve(__dirname, "..", row.Photo_Path);

        if (fs.existsSync(previousImagePath)) {
            try {
                const previousCropHashes =
                    await generateCropRegionHashes(previousImagePath);

                const cropResult = compareCropRegionHashes(
                    currentCropHashes,
                    previousCropHashes
                );

                if (
                    cropResult.isPossibleCropMatch &&
                    (
                        !closestCropMatch ||
                        cropResult.bestDistance < closestCropMatch.distance
                    )
                ) {
                    closestCropMatch = {
                        reportId: row.Report_id,
                        distance: cropResult.bestDistance,
                        matchingRegionPairs: cropResult.matchingRegionPairs,
                        consistentDisplacementPairs: cropResult.consistentDisplacementPairs
                    };
                }
            } catch (error) {
                console.error(
                    `Crop comparison failed for report ${row.Report_id}:`,
                    error.message
                );
            }
        }
    }

    const dHashThreshold = 8;
    const pHashThreshold = 8;

    const dHashDuplicate =
        closestDHashMatch !== null &&
        closestDHashMatch.distance <= dHashThreshold;

    const pHashDuplicate =
        closestPHashMatch !== null &&
        closestPHashMatch.distance <= pHashThreshold;

    const cropDuplicate = closestCropMatch !== null;

    // Crop similarity alone is not sufficient to flag a duplicate.
    // Keep crop analysis available for manual review.
    const isPossibleDuplicate =
        dHashDuplicate ||
        pHashDuplicate;
    const saveRequest = new sql.Request();

    saveRequest.input("ReportId", sql.Int, reportId);
    saveRequest.input("ImageHash", sql.Char(16), imageHash);
    saveRequest.input("PerceptualHash", sql.Char(16), perceptualHash);

    saveRequest.input(
        "SimilarReportId",
        sql.Int,
        dHashDuplicate ? closestDHashMatch.reportId : null
    );

    saveRequest.input(
        "HammingDistance",
        sql.Int,
        closestDHashMatch ? closestDHashMatch.distance : null
    );

    saveRequest.input(
        "PerceptualSimilarReportId",
        sql.Int,
        pHashDuplicate ? closestPHashMatch.reportId : null
    );

    saveRequest.input(
        "PerceptualHammingDistance",
        sql.Int,
        closestPHashMatch ? closestPHashMatch.distance : null
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
            @PerceptualHash AS Perceptual_Hash,
            @SimilarReportId AS Similar_Report_id,
            @HammingDistance AS Hamming_Distance,
            @PerceptualSimilarReportId AS Perceptual_Similar_Report_id,
            @PerceptualHammingDistance AS Perceptual_Hamming_Distance,
            @IsPossibleDuplicate AS Is_Possible_Duplicate
    ) AS source
    ON target.Report_id = source.Report_id

    WHEN MATCHED THEN
        UPDATE SET
            Image_Hash = source.Image_Hash,
            Perceptual_Hash = source.Perceptual_Hash,
            Similar_Report_id = source.Similar_Report_id,
            Hamming_Distance = source.Hamming_Distance,
            Perceptual_Similar_Report_id = source.Perceptual_Similar_Report_id,
            Perceptual_Hamming_Distance = source.Perceptual_Hamming_Distance,
            Is_Possible_Duplicate = source.Is_Possible_Duplicate,
            Checked_At = SYSUTCDATETIME()

    WHEN NOT MATCHED THEN
        INSERT (
            Report_id,
            Image_Hash,
            Perceptual_Hash,
            Similar_Report_id,
            Hamming_Distance,
            Perceptual_Similar_Report_id,
            Perceptual_Hamming_Distance,
            Is_Possible_Duplicate
        )
        VALUES (
            source.Report_id,
            source.Image_Hash,
            source.Perceptual_Hash,
            source.Similar_Report_id,
            source.Hamming_Distance,
            source.Perceptual_Similar_Report_id,
            source.Perceptual_Hamming_Distance,
            source.Is_Possible_Duplicate
        );
`);

    return {
        checkCompleted: true,
        isPossibleDuplicate,
        similarReportId: dHashDuplicate
            ? closestDHashMatch.reportId
            : null,
        hammingDistance: closestDHashMatch
            ? closestDHashMatch.distance
            : null,
        perceptualSimilarReportId: pHashDuplicate
            ? closestPHashMatch.reportId
            : null,
        perceptualHammingDistance: closestPHashMatch
            ? closestPHashMatch.distance
            : null,

        cropSimilarReportId: closestCropMatch
            ? closestCropMatch.reportId
            : null,

        cropMatchingRegionPairs: closestCropMatch
            ? closestCropMatch.matchingRegionPairs
            : 0,

        cropConsistentDisplacementPairs: closestCropMatch
            ? closestCropMatch.consistentDisplacementPairs
            : 0,

        cropBestDistance: closestCropMatch
            ? closestCropMatch.distance
            : null
    };
}

module.exports = {
    generateImageHash,
    generatePerceptualHash,
    generateCropRegionHashes,
    compareCropRegions,
    checkImageDuplicate
};