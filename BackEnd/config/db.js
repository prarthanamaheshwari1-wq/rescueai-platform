const path = require("path");
require("dotenv").config({ 
    path: path.resolve(__dirname, "../.env")
 });
const sql = require("mssql");

const dbConfig = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER || "localhost",
    database: process.env.DB_NAME || "RescueAI",
    options: {
        instanceName: "SQLEXPRESS",
        encrypt: process.env.NODE_ENV === "production",
        trustServerCertificate: process.env.NODE_ENV !== "production"
    }
};

const connectDB = async () => {
    try {
        if(!dbConfig.user || !dbConfig.password){
            throw new Error(
                "Database credentials are missing. Check DB_USER and DB_PASSWORD in .env."
            );
        }
        await sql.connect(dbConfig);
        console.log("Connected to RescueAI database successfully!");
    } catch (error) {
        console.error("Database connection failed:", error.message);
        throw error;
    }
};

module.exports = { sql, connectDB };