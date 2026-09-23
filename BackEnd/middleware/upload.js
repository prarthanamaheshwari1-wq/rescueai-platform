const multer = require("multer");
const path = require("path");

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        // Option A: If upload.js and the 'uploads' folder are in the root directory:
        cb(null, path.join(__dirname, ".." ,"uploads"));

        // Option B: If upload.js is inside a subfolder like 'src/middleware/' or 'routes/', 
        // go up to the project root first:
        // cb(null, path.join(__dirname, "..", "uploads"));
    },

    filename: function (req, file, cb) {
        const uniqueName = Date.now() + "-" + Math.round(Math.random() * 1E9);
        cb(null, uniqueName + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,

    limits: {
        fileSize: 20 * 1024 * 1024
    },

    fileFilter: function (req, file, cb) {

        const allowedTypes = [
            "image/jpeg",
            "image/png",
            "image/jpg",
            "image/webp"
        ];

        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error("Only image files are allowed"));
        }
    }
});

module.exports = upload;