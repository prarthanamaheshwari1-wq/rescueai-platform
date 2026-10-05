const express = require("express");
const router = express.Router();

const { sql } = require("../config/db");
const { getResourceRecommendations } = require("../services/resourcePlanner");


// ==========================================
// ADD RESOURCE
// ==========================================

router.post("/", async (req, res) => {

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

router.put("/:resourceId/status", async (req, res) => {

    try {

        const { resourceId } = req.params;
        const { status } = req.body;

        const request = new sql.Request();

        request.input(
            "ResourceId",
            sql.Int,
            resourceId
        );

        request.input(
            "Status",
            sql.NVarChar,
            status
        );

        await request.query(`
            UPDATE Resources
            SET Status = @Status
            WHERE Resource_id = @ResourceId
        `);

        res.status(200).json({
            message: "Resource status updated"
        });

    }
    catch (error) {

        console.error(
            "Update Resource Error:",
            error
        );

        res.status(500).json({
            message: "Server Error"
        });

    }

});


// ==========================================
// ASSIGN RESOURCE TO REPORT
// ==========================================

router.post("/assign", async (req, res) => {

    try {

        const {
            reportId,
            resourceId
        } = req.body;


        // ==========================================
        // DEBUG LOG
        // ==========================================

        console.log(
            "ASSIGN RESOURCE REQUEST:",
            {
                reportId,
                resourceId
            }
        );


        const request = new sql.Request();

        request.input(
            "ReportId",
            sql.Int,
            reportId
        );

        request.input(
            "ResourceId",
            sql.Int,
            resourceId
        );


        // ==========================================
        // CHECK RESOURCE EXISTS + STATUS
        // ==========================================

        const resourceResult = await request.query(`
            SELECT
                Resource_id,
                Resource_Name,
                Status
            FROM Resources
            WHERE Resource_id = @ResourceId
        `);


        if (resourceResult.recordset.length === 0) {

            console.log(
                "RESOURCE NOT FOUND:",
                resourceId
            );

            return res.status(404).json({
                message: "Resource not found"
            });

        }


        const resource =
            resourceResult.recordset[0];


        // ==========================================
        // DEBUG RESOURCE STATUS
        // ==========================================

        console.log(
            "RESOURCE STATUS:",
            {
                Resource_id: resource.Resource_id,
                Resource_Name: resource.Resource_Name,
                Status: resource.Status
            }
        );


        // ==========================================
        // PREVENT DUPLICATE DEPLOYMENT
        // ==========================================

        const currentStatus = String(
            resource.Status || ""
        )
            .trim()
            .toLowerCase();


        if (currentStatus === "deployed") {

            console.log(
                "BLOCKING DEPLOYED RESOURCE:",
                resource.Resource_id
            );

            return res.status(400).json({

                message:
                    "This resource is already deployed and cannot be assigned again."

            });

        }


        // ==========================================
        // CREATE ASSIGNMENT
        // ==========================================

        await request.query(`
            INSERT INTO Resource_Assignments
            (
                Report_id,
                Resource_id
            )
            VALUES
            (
                @ReportId,
                @ResourceId
            )
        `);


        // ==========================================
        // UPDATE RESOURCE STATUS
        // ==========================================

        await request.query(`
            UPDATE Resources
            SET Status = 'Deployed'
            WHERE Resource_id = @ResourceId
        `);


        console.log(
            "RESOURCE ASSIGNED SUCCESSFULLY:",
            {
                reportId,
                resourceId
            }
        );


        return res.status(200).json({

            message:
                "Resource assigned successfully"

        });

    }
    catch (error) {

        console.error(
            "Assign Resource Error:",
            error
        );

        return res.status(500).json({

            message:
                "Server Error"

        });

    }

});


// ==========================================
// GET RESOURCE RECOMMENDATIONS FOR REPORT
// ==========================================

router.get("/recommendations/:reportId", async (req, res) => {

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

router.get("/assignments", async (req, res) => {

    try {

        const request = new sql.Request();

        const result = await request.query(`
            SELECT
                RA.Assignment_id,
                RA.Report_id,
                R.Resource_Name,
                R.Resource_Type,
                R.Quantity,
                R.Location_Name,
                R.Status
            FROM Resource_Assignments RA
            INNER JOIN Resources R
                ON RA.Resource_id = R.Resource_id
            ORDER BY RA.Assignment_id DESC
        `);

        res.status(200).json(
            result.recordset
        );

    }
    catch (error) {

        console.error(
            "Assignment Fetch Error:",
            error
        );

        res.status(500).json({
            message: "Server Error"
        });

    }

});


// ==========================================
// EXPORT ROUTER
// ==========================================

module.exports = router;