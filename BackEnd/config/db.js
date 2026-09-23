const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const sql = require("mssql");

const dbConfig = {
    user: process.env.DB_USER || "rescueai_user",
    password: process.env.DB_PASSWORD || "RescueAI#2026Strong",
    server: process.env.DB_SERVER || "localhost",
    database: process.env.DB_NAME || "RescueAI",
    options: {
        instanceName: "SQLEXPRESS",
        encrypt: false,
        trustServerCertificate: true
    }
};

const connectDB = async () => {
    try {
        await sql.connect(dbConfig);
        console.log("Connected to RescueAI database successfully!");
    } catch (error) {
        console.error("Database connection failed:", error);
    }
};

module.exports = { sql, connectDB };