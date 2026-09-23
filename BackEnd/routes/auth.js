const express = require("express");
const bcrypt = require("bcrypt");
const router = express.Router();
const { sql } = require("../config/db");

router.post("/register", async (req, res) => {
    try {
        const { fullName, email, password, role, phoneNo } = req.body;

        if (!fullName || !email || !password) {
            return res.status(400).json({
                message: "Full name, email, and password are required"
            });
        }

        // 1. Check existing user
        const checkRequest = new sql.Request();
        checkRequest.input("Email", sql.VarChar, email);
        const existingUser = await checkRequest.query(
            "SELECT * FROM Users WHERE Email = @Email"
        );

        if (existingUser.recordset.length > 0) {
            return res.status(400).json({ message: "Email already exists" });
        }

        // 2. Hash Password
        const hashedPassword = await bcrypt.hash(password, 10);

        // 3. Insert user
        const insertRequest = new sql.Request();
        insertRequest.input("FullName", sql.VarChar, fullName);
        insertRequest.input("Email", sql.VarChar, email);
        insertRequest.input("PasswordHash", sql.VarChar, hashedPassword);
        insertRequest.input("Role", sql.VarChar, role || "citizen");
        insertRequest.input("PhoneNo", sql.VarChar, phoneNo || null);

        await insertRequest.query(`
            INSERT INTO Users (Full_Name, Email, Password_Hash, Role, Phone_No)
            VALUES (@FullName, @Email, @PasswordHash, @Role, @PhoneNo)
        `);

        res.status(201).json({ message: "User registered successfully" });
    } catch (error) {
        console.error("Registration Error:", error);
        res.status(500).json({ message: "Server Error", error: error.message });
    }
});

module.exports = router;