require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const dns = require("dns");

try {
    dns.setDefaultResultOrder("ipv4first");
} catch (dnsErr) {
    console.warn("DNS configuration warning:", dnsErr.message);
}

const authRoutes = require("./routes/auth");
const reportRoutes = require("./routes/reports");
const disasterRoutes = require("./routes/disasters");
const aiAnalysisRoutes = require("./routes/ai-analysis");
const weatherRoutes = require("./routes/weather");
const resourceRoutes = require("./routes/resources");
const volunteerRoutes = require("./routes/volunteers");
const alertRoutes = require("./routes/alerts");
const { connectDB } = require("./config/db");

const app = express();
app.disable("x-powered-by");

// app.use(cors({
//     origin: [
//         "http://127.0.0.1:3000",
//         "http://127.0.0.1:8000"
//     ]
// }));

const allowedOrigins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
    process.env.CLIENT_URL
].filter(Boolean);

app.use(
    cors({
        origin: (origin, callback) => {
            if (!origin || allowedOrigins.includes(origin)) {
                callback(null, true);
            } else {
                callback(new Error(`CORS blocked for origin: ${origin}`));
            }
        },
        credentials: true,
        methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
    })
);
app.use(express.json({ limit: "1mb" }));

// 1. Ensure uploads directory exists inside BackEnd
const uploadsPath = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsPath)) {
    fs.mkdirSync(uploadsPath, { recursive: true });
}


// 3. Serve static images directly from BackEnd/uploads
// app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use(
    "/uploads",
    express.static(path.join(__dirname, "uploads"), {
        dotfiles: "ignore",
        etag: true,
        extensions: ["jpg", "jpeg", "png", "webp", "gif"]
    })
);

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/disasters", disasterRoutes);
app.use("/api/ai-analysis", aiAnalysisRoutes);
app.use("/api/weather", weatherRoutes);
app.use("/api/resources", resourceRoutes);
app.use("/api/volunteers", volunteerRoutes);
app.use("/api/alerts", alertRoutes);

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