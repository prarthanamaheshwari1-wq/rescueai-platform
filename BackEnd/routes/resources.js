const express = require("express");
const router = express.Router();

const { sql } = require("../config/db");


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
            message:
                "Resource status updated"
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

        await request.query(`
            UPDATE Resources
            SET Status = 'Deployed'
            WHERE Resource_id = @ResourceId
        `);

        res.status(200).json({
            message:
                "Resource assigned successfully"
        });

    }
    catch (error) {

        console.error(
            "Assign Resource Error:",
            error
        );

        res.status(500).json({
            message: "Server Error"
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