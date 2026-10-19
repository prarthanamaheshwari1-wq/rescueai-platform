
const crypto = require("crypto");
const { sql } = require("../config/db");
const { redisClient } = require("../config/redis");

// ==========================================
// VERIFY ACCESS TOKEN
// ==========================================

async function authenticateToken(req, res, next) {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return res.status(401).json({
                message: "Access token is required."
            });
        }

        const accessToken = authHeader.substring(7).trim();

        if (!accessToken) {
            return res.status(401).json({
                message: "Access token is required."
            });
        }

        // Hash the token exactly as auth.js does.
        const tokenHash = crypto
            .createHash("sha256")
            .update(accessToken)
            .digest("hex");

        const sessionKey = `access:${tokenHash}`;
        const sessionData = await redisClient.get(sessionKey);

        if (!sessionData) {
            return res.status(401).json({
                message: "Invalid or expired access token."
            });
        }

        let session;

        try {
            session = JSON.parse(sessionData);
        } catch {
            await redisClient.del(sessionKey);

            return res.status(401).json({
                message: "Invalid access-token session."
            });
        }

        if (
            !session ||
            typeof session !== "object" ||
            !Number.isSafeInteger(session.userId) ||
            session.userId <= 0
        ) {
            await redisClient.del(sessionKey);

            return res.status(401).json({
                message: "Invalid access-token session."
            });
        }

        // Verify the user still exists and use the current database role.
        const request = new sql.Request();

        request.input("UserID", sql.Int, session.userId);

        const result = await request.query(`
            SELECT User_id, Role
            FROM Users
            WHERE User_id = @UserID
        `);

        if (result.recordset.length === 0) {
            await redisClient.del(sessionKey);

            return res.status(401).json({
                message: "User account no longer exists."
            });
        }

        const user = result.recordset[0];

        req.user = {
            id: user.User_id,
            role: String(user.Role || "").trim().toLowerCase()
        };

        return next();

    } catch (error) {
        console.error("Authentication Middleware Error:", error);

        return res.status(500).json({
            message: "Authentication service error."
        });
    }
}

// ==========================================
// CHECK PERMITTED ROLES
// ==========================================

function authorizeRoles(...allowedRoles) {
    const normalizedRoles = allowedRoles.map(role =>
        String(role).trim().toLowerCase()
    );

    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                message: "Authentication is required."
            });
        }

        if (!normalizedRoles.includes(req.user.role)) {
            return res.status(403).json({
                message: "You do not have permission to perform this action."
            });
        }

        return next();
    };
}

module.exports = {
    authenticateToken,
    authorizeRoles
};