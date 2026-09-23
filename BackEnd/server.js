require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");

const authRoutes = require("./routes/auth");
const reportRoutes = require("./routes/reports");
const disasterRoutes = require("./routes/disasters");
const aiAnalysisRoutes = require("./routes/ai-analysis");
const weatherRoutes = require("./routes/weather");
const { connectDB } = require("./config/db");

const app = express();

app.use(cors());
app.use(express.json());

// 1. Ensure uploads directory exists inside BackEnd
const uploadsPath = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsPath)) {
    fs.mkdirSync(uploadsPath, { recursive: true });
}


// 3. Serve static images directly from BackEnd/uploads
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/disasters", disasterRoutes);
app.use("/api/ai-analysis", aiAnalysisRoutes);
app.use("/api/weather", weatherRoutes);

app.get("/", (req, res) => {
    res.json({ message: "RescueAI Backend running!" });
});

const PORT = process.env.PORT || 5000;

const startServer = async () => {
    await connectDB();
    app.listen(PORT, () => {
        console.log(`Server running at http://localhost:${PORT}`);
    });
};

startServer();