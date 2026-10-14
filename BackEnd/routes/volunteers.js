const express = require("express");
const bcrypt = require("bcrypt");
const router = express.Router();
const { sql } = require("../config/db");
const { authenticateToken, authorizeRoles } = require("../middleware/auth");

// ==========================================
// Get all volunteers
// ==========================================

router.get(
    "/",
    authenticateToken,
    authorizeRoles("authority", "responder"),
    async (req, res) => {

        try {

            const request = new sql.Request();

            const result = await request.query(`
            SELECT
                V.Volunteer_id,
                U.Full_Name,
                U.Email,
                U.Phone_No,
                U.Role,
                V.Skills,
                V.Availability,
                V.Location_Name,
                V.Latitude,
                V.Longitude
            FROM Volunteers V
            INNER JOIN Users U
                ON V.User_id = U.User_id
            ORDER BY V.Volunteer_id DESC
        `);

            res.status(200).json(result.recordset);

        } catch (error) {

            console.error("Volunteer Error:", error);

            res.status(500).json({
                message: "Server Error"
            });

        }

    });


// ==========================================
// Add new volunteer
// ==========================================

router.post(
    "/",
    authenticateToken,
    authorizeRoles("authority"),
    async (req, res) => {

        try {

            const {
                fullName,
                email,
                password,
                phoneNo,
                skills,
                locationName,
                latitude,
                longitude,
                role
            } = req.body;


            // Validate required fields

            if (
                !fullName ||
                !email ||
                !password
            ) {

                return res.status(400).json({
                    message:
                        "Full name, email, and password are required."
                });

            }

            const normalizedRole = String(role || "")
                .trim()
                .toLowerCase();

            if (!["volunteer", "authority"].includes(normalizedRole)) {
                return res.status(400).json({
                    message: "Role must be Volunteer or Authority."
                });
            }

            const assignedRole =
                normalizedRole === "authority"
                    ? "authority"
                    : "Volunteer";


            // Check whether email already exists

            const checkRequest =
                new sql.Request();

            checkRequest.input(
                "Email",
                sql.VarChar,
                email
            );

            const existingUser =
                await checkRequest.query(`
                SELECT User_id
                FROM Users
                WHERE Email = @Email
            `);


            if (existingUser.recordset.length > 0) {

                return res.status(400).json({
                    message:
                        "Email already exists."
                });

            }


            // Hash password

            const hashedPassword =
                await bcrypt.hash(password, 10);


            // Create User

            const userRequest =
                new sql.Request();

            userRequest.input(
                "FullName",
                sql.VarChar,
                fullName
            );

            userRequest.input(
                "Email",
                sql.VarChar,
                email
            );

            userRequest.input(
                "PasswordHash",
                sql.VarChar,
                hashedPassword
            );

            userRequest.input(
                "PhoneNo",
                sql.VarChar,
                phoneNo || null
            );

            userRequest.input(
                "Role",
                sql.VarChar,
                assignedRole
            );


            const userResult =
                await userRequest.query(`
                INSERT INTO Users
                (
                    Full_Name,
                    Email,
                    Password_Hash,
                    Role,
                    Phone_No
                )
                OUTPUT INSERTED.User_id
                VALUES
                (
                    @FullName,
                    @Email,
                    @PasswordHash,
                    @Role,
                    @PhoneNo
                )
            `);


            const userId =
                userResult.recordset[0].User_id;


            // Create Volunteer

            const volunteerRequest =
                new sql.Request();

            volunteerRequest.input(
                "UserId",
                sql.Int,
                userId
            );

            volunteerRequest.input(
                "Skills",
                sql.NVarChar,
                skills || null
            );

            volunteerRequest.input(
                "LocationName",
                sql.NVarChar,
                locationName || null
            );

            volunteerRequest.input(
                "Latitude",
                sql.Decimal(10, 7),
                latitude || null
            );

            volunteerRequest.input(
                "Longitude",
                sql.Decimal(10, 7),
                longitude || null
            );


            const volunteerResult =
                await volunteerRequest.query(`
                INSERT INTO Volunteers
                (
                    User_id,
                    Skills,
                    Availability,
                    Location_Name,
                    Latitude,
                    Longitude
                )
                OUTPUT INSERTED.Volunteer_id
                VALUES
                (
                    @UserId,
                    @Skills,
                    'available',
                    @LocationName,
                    @Latitude,
                    @Longitude
                )
            `);


            const volunteerId =
                volunteerResult.recordset[0].Volunteer_id;


            res.status(201).json({

                message:
                    "Volunteer added successfully.",

                volunteerId: volunteerId

            });


        } catch (error) {

            console.error(
                "Add Volunteer Error:",
                error
            );

            res.status(500).json({

                message: "Server Error"

            });

        }

    });


module.exports = router;