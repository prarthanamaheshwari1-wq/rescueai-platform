const express = require("express");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const router = express.Router();
const { sql } = require("../config/db");
const { redisClient } = require("../config/redis");

// ==========================================
// TOKEN GENERATOR
// ==========================================

function generateToken() {

    return crypto.randomBytes(32).toString("hex");

}

// ==========================================
// TOKEN HASH
// ==========================================

function hashToken(token) {

    return crypto
        .createHash("sha256")
        .update(token)
        .digest("hex");

}

// ==========================================
// TOKEN SETTINGS
// ==========================================

const ACCESS_TOKEN_EXPIRY = 10 * 60;           // 10 minutes
const REFRESH_TOKEN_EXPIRY = 7 * 24 * 60 * 60; // 7 days


// ==========================================
// READ COOKIE
// ==========================================

// ==========================================
// READ COOKIE
// ==========================================

// function getCookie(req, cookieName) {
//     const cookies = req.headers.cookie;

//     if (!cookies) {
//         return null;
//     }

//     const cookie = cookies
//         .split(";")
//         .map(item => item.trim())
//         .find(item => item.startsWith(cookieName + "="));

//     if (!cookie) {
//         return null;
//     }

//     return decodeURIComponent(
//         cookie.substring(cookieName.length + 1)
//     );
// }



// ==========================================
// REGISTER
// ==========================================

router.post("/register", async (req, res) => {

    try {

        const {
            fullName,
            email,
            password,
            role,
            phoneNo
        } = req.body;


        const allowedRoles = ["citizen"];


        if (role && !allowedRoles.includes(role)) {

            return res.status(400).json({
                message: "Invalid role."
            });

        }


        if (!fullName || !email || !password) {

            return res.status(400).json({
                message:
                    "Full name, email, and password are required"
            });

        }


        // ==========================================
        // CHECK EXISTING USER
        // ==========================================

        const checkRequest =
            new sql.Request();

        checkRequest.input(
            "Email",
            sql.VarChar,
            email
        );

        const existingUser =
            await checkRequest.query(
                "SELECT * FROM Users WHERE Email = @Email"
            );


        if (existingUser.recordset.length > 0) {

            return res.status(400).json({
                message:
                    "Email already exists"
            });

        }


        // ==========================================
        // HASH PASSWORD
        // ==========================================

        const hashedPassword =
            await bcrypt.hash(password, 10);


        // ==========================================
        // INSERT USER
        // ==========================================

        const insertRequest =
            new sql.Request();

        insertRequest.input(
            "FullName",
            sql.VarChar,
            fullName
        );

        insertRequest.input(
            "Email",
            sql.VarChar,
            email
        );

        insertRequest.input(
            "PasswordHash",
            sql.VarChar,
            hashedPassword
        );

        insertRequest.input(
            "Role",
            sql.VarChar,
            role || "citizen"
        );

        insertRequest.input(
            "PhoneNo",
            sql.VarChar,
            phoneNo || null
        );


        await insertRequest.query(`
            INSERT INTO Users
            (
                Full_Name,
                Email,
                Password_Hash,
                Role,
                Phone_No
            )
            VALUES
            (
                @FullName,
                @Email,
                @PasswordHash,
                @Role,
                @PhoneNo
            )
        `);


        res.status(201).json({
            message:
                "User registered successfully"
        });



    } catch (error) {

        console.error("Registration failed:", error.message);

        return res.status(500).json({
            message: "Registration failed due to a server error."
        });

    }


});


// ==========================================
// LOGIN
// ==========================================

router.post("/login", async (req, res) => {

    try {

        const {
            email,
            password
        } = req.body;


        if (
            typeof email !== "string" ||
            typeof password !== "string" ||
            !email.trim() ||
            !password
        ) {
            return res.status(400).json({
                message: "Email and password are required"
            });
        }


        // ==========================================
        // FIND USER
        // ==========================================

        const normalizedEmail = email.trim();

        const request = new sql.Request();

        request.input(
            "Email",
            sql.VarChar,
            normalizedEmail
        );


        const result =
            await request.query(
                "SELECT * FROM Users WHERE Email = @Email"
            );


        if (result.recordset.length === 0) {

            return res.status(401).json({
                message:
                    "Invalid email or password"
            });

        }


        const user =
            result.recordset[0];


        const allowedRoles = ["authority", "volunteer"];

        if (!allowedRoles.includes(
            String(user.Role).trim().toLowerCase()
        )) {
            return res.status(403).json({
                message: "Login is allowed only for Authority and Volunteer accounts."
            });
        }


        // ==========================================
        // VERIFY PASSWORD
        // ==========================================

        const passwordMatch =
            await bcrypt.compare(
                password,
                user.Password_Hash
            );


        if (!passwordMatch) {

            return res.status(401).json({
                message:
                    "Invalid email or password"
            });

        }


        // ==========================================
        // GENERATE TOKENS
        // ==========================================

        const accessToken =
            generateToken();

        const refreshToken =
            generateToken();


        // ==========================================
        // HASH TOKENS FOR REDIS
        // ==========================================

        const accessTokenHash =
            hashToken(accessToken);

        const refreshTokenHash =
            hashToken(refreshToken);


        // ==========================================
        // STORE REFRESH SESSION IN REDIS
        // ==========================================

        const refreshSessionKey =
            `refresh:${refreshTokenHash}`;

        await redisClient.set(
            refreshSessionKey,
            JSON.stringify({
                userId: user.User_id
            }),
            {
                EX: REFRESH_TOKEN_EXPIRY
            }
        );


        // ==========================================
        // STORE ACCESS SESSION IN REDIS
        // ==========================================

        const accessSessionKey =
            `access:${accessTokenHash}`;

        await redisClient.set(
            accessSessionKey,
            JSON.stringify({
                userId: user.User_id,
                role: user.Role
            }),
            {
                EX: ACCESS_TOKEN_EXPIRY
            }
        );


        // ==========================================
        // STORE REFRESH TOKEN IN HTTPONLY COOKIE
        // ==========================================

        const isProduction = process.env.NODE_ENV === "production";

        res.cookie(
            "refreshToken",
            refreshToken,
            {
                httpOnly: true,
                secure: isProduction,
                sameSite: isProduction ? "none" : "lax",
                maxAge: REFRESH_TOKEN_EXPIRY * 1000,
                path: "/"
            }
        );


        // ==========================================
        // SEND ACCESS TOKEN
        // ==========================================

        res.status(200).json({

            message:
                "Login successful",

            accessToken,

            user: {

                id:
                    user.User_id,

                fullName:
                    user.Full_Name,

                email:
                    user.Email,

                role:
                    user.Role,

                phoneNo:
                    user.Phone_No

            }

        });



    } catch (error) {

        console.error("Login failed:", error.message);

        return res.status(500).json({
            message: "Login failed due to a server error."
        });

    }


});


// ==========================================
// REFRESH ACCESS TOKEN
// ==========================================

router.post("/refresh", async (req, res) => {

    try {

        // ==========================================
        // GET REFRESH TOKEN FROM COOKIE
        // ==========================================

        const refreshToken = req.cookies.refreshToken;

        if (!refreshToken) {

            return res.status(401).json({
                message:
                    "Refresh token missing"
            });

        }


        // ==========================================
        // HASH REFRESH TOKEN
        // ==========================================

        const refreshTokenHash =
            hashToken(refreshToken);


        const refreshSessionKey =
            `refresh:${refreshTokenHash}`;


        // ==========================================
        // FIND SESSION IN REDIS
        // ==========================================

        const sessionData =
            await redisClient.get(
                refreshSessionKey
            );


        if (!sessionData) {

            const isProduction = process.env.NODE_ENV === "production";
            res.clearCookie("refreshToken", {
                httpOnly: true,
                secure: isProduction,
                sameSite: isProduction ? "none" : "lax",
                path: "/"
            });

            return res.status(401).json({
                message: "Invalid or expired refresh token"
            });

        }

        let session;

        try {
            session = JSON.parse(sessionData);
        } catch {
            await redisClient.del(refreshSessionKey);

            const isProduction = process.env.NODE_ENV === "production";

            res.clearCookie("refreshToken", {
                httpOnly: true,
                secure: isProduction,
                sameSite: isProduction ? "none" : "lax",
                path: "/"
            });

            return res.status(401).json({
                message: "Invalid refresh-token session."
            });
        }

        if (
            !session ||
            typeof session !== "object" ||
            !Number.isSafeInteger(session.userId) ||
            session.userId <= 0
        ) {
            await redisClient.del(refreshSessionKey);

            const isProduction = process.env.NODE_ENV === "production";

            res.clearCookie("refreshToken", {
                httpOnly: true,
                secure: isProduction,
                sameSite: isProduction ? "none" : "lax",
                path: "/"
            });

            return res.status(401).json({
                message: "Invalid refresh-token session."
            });
        }


        // ==========================================
        // FIND USER
        // ==========================================

        const userRequest =
            new sql.Request();

        userRequest.input(
            "UserID",
            sql.Int,
            session.userId
        );


        const userResult =
            await userRequest.query(
                "SELECT * FROM Users WHERE User_id = @UserID"
            );


        if (userResult.recordset.length === 0) {

            await redisClient.del(refreshSessionKey);

            const isProduction = process.env.NODE_ENV === "production";

            res.clearCookie("refreshToken", {
                httpOnly: true,
                secure: isProduction,
                sameSite: isProduction ? "none" : "lax",
                path: "/"
            });

            return res.status(401).json({
                message: "User no longer exists"
            });

        }


        const user =
            userResult.recordset[0];


        const allowedRoles = ["authority", "volunteer"];

        if (!allowedRoles.includes(
            String(user.Role).trim().toLowerCase()
        )) {
            await redisClient.del(refreshSessionKey);

            const isProduction = process.env.NODE_ENV === "production";

            res.clearCookie("refreshToken", {
                httpOnly: true,
                secure: isProduction,
                sameSite: isProduction ? "none" : "lax",
                path: "/"
            });

            return res.status(403).json({
                message: "Your account role is not allowed to log in."
            });
        }


        // ==========================================
        // GENERATE NEW TOKENS
        // ==========================================

        const newAccessToken =
            generateToken();

        const newRefreshToken =
            generateToken();


        const newAccessTokenHash =
            hashToken(newAccessToken);

        const newRefreshTokenHash =
            hashToken(newRefreshToken);


        // ==========================================
        // DELETE OLD REFRESH SESSION
        // ==========================================

        await redisClient.del(
            refreshSessionKey
        );


        // ==========================================
        // STORE NEW REFRESH SESSION
        // ==========================================

        const newRefreshSessionKey =
            `refresh:${newRefreshTokenHash}`;

        await redisClient.set(
            newRefreshSessionKey,
            JSON.stringify({
                userId: user.User_id
            }),
            {
                EX: REFRESH_TOKEN_EXPIRY
            }
        );


        // ==========================================
        // STORE NEW ACCESS SESSION
        // ==========================================

        const newAccessSessionKey =
            `access:${newAccessTokenHash}`;

        await redisClient.set(
            newAccessSessionKey,
            JSON.stringify({
                userId: user.User_id,
                role: user.Role
            }),
            {
                EX: ACCESS_TOKEN_EXPIRY
            }
        );


        // ==========================================
        // REPLACE REFRESH COOKIE
        // ==========================================

        // ==========================================
        // REPLACE REFRESH COOKIE
        // ==========================================

        const isProduction = process.env.NODE_ENV === "production";

        res.cookie(
            "refreshToken",
            newRefreshToken,
            {
                httpOnly: true,
                secure: isProduction,
                sameSite: isProduction ? "none" : "lax",
                maxAge: REFRESH_TOKEN_EXPIRY * 1000,
                path: "/"
            }
        );


        // ==========================================
        // SEND NEW ACCESS TOKEN & USER INFO
        // ==========================================

        res.status(200).json({

            message:
                "Access token refreshed",

            accessToken:
                newAccessToken,

            user: {

                id:
                    user.User_id,

                fullName:
                    user.Full_Name,

                email:
                    user.Email,

                role:
                    user.Role,

                phoneNo:
                    user.Phone_No

            }

        });



    } catch (error) {

        console.error("Token refresh failed:", error.message);

        return res.status(500).json({
            message: "Unable to refresh session."
        });

    }


});

// ==========================================
// LOGOUT
// ==========================================

router.post("/logout", async (req, res) => {
    try {
        // 1. Get refresh token from cookie
        const refreshToken = req.cookies.refreshToken;

        // 2. Delete refresh session from Redis
        if (refreshToken) {
            const refreshTokenHash = hashToken(refreshToken);
            await redisClient.del(`refresh:${refreshTokenHash}`);
        }

        // 3. Optionally revoke the current access token if provided in headers
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith("Bearer ")) {
            const accessToken = authHeader.substring(7).trim();
            if (accessToken) {
                const accessTokenHash = hashToken(accessToken);
                await redisClient.del(`access:${accessTokenHash}`);
            }
        }

        // 4. Clear refresh cookie
        const isProduction = process.env.NODE_ENV === "production";
        res.clearCookie("refreshToken", {
            httpOnly: true,
            secure: isProduction,
            sameSite: isProduction ? "none" : "lax",
            path: "/"
        });

        return res.status(200).json({
            message: "Logout successful"
        });

    } catch (error) {
        console.error("Logout failed:", error.message);
        return res.status(500).json({
            message: "Unable to log out due to a server error."
        });
    }
});


module.exports = router;