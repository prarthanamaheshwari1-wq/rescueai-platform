const express = require("express");
const router = express.Router();

const { sql } = require("../config/db");

// Get All Resources

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

    } catch (error) {

        console.error("Add Resource Error:", error);

        res.status(500).json({
            message: "Server Error"
        });

    }

});

router.get("/", async (req, res) => {

    try {

        const request = new sql.Request();

        const result = await request.query(`
            SELECT *
            FROM Resources
            ORDER BY Resource_id DESC
        `);

        res.status(200).json(result.recordset);

    } catch (error) {

        console.error("Resources Error:", error);

        res.status(500).json({
            message: "Server Error"
        });

    }

});

// Update Resource Status

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

    } catch (error) {

        console.error("Update Resource Error:", error);

        res.status(500).json({
            message: "Server Error"
        });

    }

});

module.exports = router;