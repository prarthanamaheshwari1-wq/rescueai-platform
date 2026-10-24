const express = require("express");
const router = express.Router();

const { sql } = require("../config/db");
const { getResourceRecommendations } = require("../services/resourcePlanner");
const { authenticateToken, authorizeRoles } = require("../middleware/auth");


// ==========================================
// ADD RESOURCE
// ==========================================

router.post("/", authenticateToken, authorizeRoles("authority"), async (req, res) => {

    try {

        const {
            resourceName,
            resourceType,
            quantity,
            location,
            status
        } = req.body;

        const request = new sql.Request();

        request.input(
            "ResourceName",
            sql.NVarChar,
            resourceName
        );

        request.input(
            "ResourceType",
            sql.NVarChar,
            resourceType
        );

        request.input(
            "Quantity",
            sql.Int,
            quantity
        );

        request.input(
            "Location",
            sql.NVarChar,
            location
        );

        request.input(
            "Status",
            sql.NVarChar,
            status
        );

        await request.query(`
            INSERT INTO Resources
            (
                Resource_Name,
                Resource_Type,
                Quantity,
                Location_Name,
                Status
            )
            VALUES
            (
                @ResourceName,
                @ResourceType,
                @Quantity,
                @Location,
                @Status
            )
        `);

        res.status(201).json({
            message: "Resource added successfully"
        });

    }
    catch (error) {

        console.error(
            "Add Resource Error:",
            error
        );

        res.status(500).json({
            message: "Server Error"
        });

    }

});


// ==========================================
// GET ALL RESOURCES
// ==========================================

router.get("/", async (req, res) => {

    try {

        const request = new sql.Request();

        const result = await request.query(`
            SELECT *
            FROM Resources
            ORDER BY Resource_id DESC
        `);

        res.status(200).json(
            result.recordset
        );

    }
    catch (error) {

        console.error(
            "Resources Error:",
            error
        );

        res.status(500).json({
            message: "Server Error"
        });

    }

});


// ==========================================
// UPDATE RESOURCE STATUS
// ==========================================


router.put(
    "/:resourceId/status",
    authenticateToken,
    authorizeRoles("authority"),
    async (req, res) => {
        try {
            const resourceId = Number(req.params.resourceId);
            const requestedStatus = String(req.body?.status || "")
                .trim()
                .toLowerCase();

            if (!Number.isSafeInteger(resourceId) || resourceId <= 0) {
                return res.status(400).json({
                    message: "Valid resource ID is required."
                });
            }

            if (!["available", "deployed"].includes(requestedStatus)) {
                return res.status(400).json({
                    message: "Status must be Available or Deployed."
                });
            }

            const request = new sql.Request();
            request.input("ResourceId", sql.Int, resourceId);
            request.input(
                "RequestedStatus",
                sql.NVarChar(20),
                requestedStatus === "available" ? "Available" : "Deployed"
            );

            const result = await request.query(`
                UPDATE Resources
                SET Status = CASE
                    WHEN ISNULL(Quantity, 0) <= 0 THEN 'Deployed'
                    ELSE @RequestedStatus
                END
                OUTPUT
                    INSERTED.Resource_id AS Resource_id,
                    INSERTED.Quantity AS Quantity,
                    INSERTED.Status AS Status
                WHERE Resource_id = @ResourceId;
            `);

            if (result.recordset.length === 0) {
                return res.status(404).json({
                    message: "Resource not found."
                });
            }

            const resource = result.recordset[0];

            if (
                Number(resource.Quantity) <= 0 &&
                requestedStatus === "available"
            ) {
                return res.status(400).json({
                    message: "This resource has zero available units and cannot be marked Available.",
                    resource
                });
            }

            return res.status(200).json({
                message: "Resource status updated successfully.",
                resource
            });
        } catch (error) {
            console.error("Update Resource Error:", error);

            return res.status(500).json({
                message: "Failed to update resource status."
            });
        }
    }
);



// ==========================================
// ASSIGN RESOURCE TO REPORT
// ==========================================


router.post("/assign", authenticateToken, authorizeRoles("authority"), async (req, res) => {
    try {
        const reportId = Number(req.body.reportId);
        const resourceId = Number(req.body.resourceId);

        if (
            !Number.isSafeInteger(reportId) ||
            reportId <= 0 ||
            !Number.isSafeInteger(resourceId) ||
            resourceId <= 0
        ) {
            return res.status(400).json({
                message: "Valid report ID and resource ID are required."
            });
        }

        const request = new sql.Request();

        request.input("ReportId", sql.Int, reportId);
        request.input("ResourceId", sql.Int, resourceId);

        // Validate and assign atomically to prevent partial updates.
        const result = await request.query(`
            SET XACT_ABORT ON;

            BEGIN TRY
                BEGIN TRANSACTION;

                                DECLARE @ReportStatus NVARCHAR(100);

                SELECT @ReportStatus = Status
                FROM Incident_Reports WITH (UPDLOCK, HOLDLOCK)
                WHERE Report_id = @ReportId;

                IF @@ROWCOUNT = 0
                BEGIN
                    THROW 50001, 'Report not found.', 1;
                END

                IF LOWER(LTRIM(RTRIM(ISNULL(@ReportStatus, ''))))
                    IN ('rejected', 'resolved')
                BEGIN
                    THROW 50006, 'Resources cannot be assigned to a rejected or resolved report.', 1;
                END;

                DECLARE @CurrentStatus NVARCHAR(100);
                DECLARE @CurrentQuantity INT;

                SELECT
                    @CurrentStatus = Status,
                    @CurrentQuantity = Quantity
                FROM Resources WITH (UPDLOCK, HOLDLOCK)
                WHERE Resource_id = @ResourceId;

                IF @@ROWCOUNT = 0
                BEGIN
                    THROW 50002, 'Resource not found.', 1;
                END;

                IF LOWER(LTRIM(RTRIM(ISNULL(@CurrentStatus, ''))))
                    <> 'available'
                BEGIN
                    THROW 50003, 'Resource is not available.', 1;
                END;

                IF ISNULL(@CurrentQuantity, 0) <= 0
                BEGIN
                    THROW 50004, 'Resource quantity is exhausted.', 1;
                END;

                IF EXISTS (
                    SELECT 1
                    FROM Resource_Assignments WITH (UPDLOCK, HOLDLOCK)
                    WHERE Report_id = @ReportId
                      AND Resource_id = @ResourceId
                      AND Status = 'Active'
                )
                BEGIN
                    THROW 50005, 'This resource is already assigned to this report.', 1;
                END;

                INSERT INTO Resource_Assignments
                    (Report_id, Resource_id, Status)
                VALUES
                    (@ReportId, @ResourceId, 'Active');

                UPDATE Resources
                SET
                    Quantity = Quantity - 1,
                    Status = CASE
                        WHEN Quantity - 1 <= 0 THEN 'Deployed'
                        ELSE 'Available'
                    END
                WHERE Resource_id = @ResourceId;

                COMMIT TRANSACTION;

                SELECT
                    SCOPE_IDENTITY() AS Assignment_id;
            END TRY
            BEGIN CATCH
                IF XACT_STATE() <> 0
                    ROLLBACK TRANSACTION;

                THROW;
            END CATCH;
        `);

        return res.status(200).json({
            message: "Resource assigned successfully.",
            assignmentId: result.recordset[0]?.Assignment_id
        });
    } catch (error) {
        const errorNumber =
            error.number ?? error.originalError?.info?.number;

        const expectedErrors = {
            50001: [404, "Report not found."],
            50002: [404, "Resource not found."],
            50003: [400, "Resource is not available."],
            50004: [400, "Resource quantity is exhausted."],
            50005: [409, "This resource is already assigned to this report."],
            50006: [409, "Resources cannot be assigned to a rejected or resolved report."]
        };

        if (expectedErrors[errorNumber]) {
            const [statusCode, message] = expectedErrors[errorNumber];

            return res.status(statusCode).json({ message });
        }

        console.error("Assign Resource Error:", error);

        return res.status(500).json({
            message: "Failed to assign resource."
        });
    }
});



// ==========================================
// GET RESOURCE RECOMMENDATIONS FOR REPORT
// ==========================================

router.get("/recommendations/:reportId", authenticateToken, authorizeRoles("authority"), async (req, res) => {

    try {

        const { reportId } = req.params;

        const request = new sql.Request();

        request.input(
            "ReportId",
            sql.Int,
            reportId
        );

        // ==========================================
        // GET REPORT CATEGORY + SEVERITY
        // ==========================================

        const reportResult = await request.query(`

            SELECT
                Report_id,
                Category,
                Severity

            FROM Incident_Reports

            WHERE Report_id = @ReportId

        `);

        if (reportResult.recordset.length === 0) {

            return res.status(404).json({

                message:
                    "Report not found."

            });

        }

        const report =
            reportResult.recordset[0];


        // ==========================================
        // GET INTELLIGENT RESOURCE RECOMMENDATIONS
        // ==========================================

        const recommendations =
            await getResourceRecommendations(
                report.Category,
                report.Severity
            );


        // ==========================================
        // RETURN RECOMMENDATIONS
        // ==========================================

        res.status(200).json({

            reportId:
                report.Report_id,

            category:
                report.Category,

            severity:
                report.Severity,

            recommendations

        });

    }
    catch (error) {

        console.error(
            "Resource Recommendation Error:",
            error
        );

        res.status(500).json({

            message:
                "Failed to generate resource recommendations."

        });

    }

});


// ==========================================
// GET ASSIGNED RESOURCES
// ==========================================


router.get("/assignments", authenticateToken, authorizeRoles("authority"), async (req, res) => {
    try {
        const request = new sql.Request();

        const result = await request.query(`
            SELECT
                RA.Assignment_id,
                RA.Report_id,
                RA.Resource_id,
                RA.Assigned_At,
                RA.Status AS Status,
                R.Resource_Name,
                R.Resource_Type,
                R.Quantity,
                R.Location_Name,
                R.Status AS Resource_Status
            FROM Resource_Assignments RA
            INNER JOIN Resources R
                ON RA.Resource_id = R.Resource_id
            ORDER BY RA.Assignment_id DESC
        `);

        return res.status(200).json(result.recordset);
    } catch (error) {
        console.error("Assignment Fetch Error:", error);

        return res.status(500).json({
            message: "Failed to fetch resource assignments."
        });
    }
});



// ==========================================
// EXPORT ROUTER
// ==========================================

module.exports = router;