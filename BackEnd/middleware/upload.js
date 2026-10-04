const multer = require("multer");
const path = require("path");

const storage = multer.diskStorage({

    destination: function (req, file, cb) {

        cb(
            null,
            path.join(__dirname, "..", "uploads")
        );

    },

    filename: function (req, file, cb) {

        const uniqueName =
            Date.now() +
            "-" +
            Math.round(Math.random() * 1E9);

        cb(
            null,
            uniqueName + path.extname(file.originalname)
        );

    }

});


const upload = multer({

    storage: storage,

    limits: {
        fileSize: 20 * 1024 * 1024
    },

    fileFilter: function (req, file, cb) {

        /*
         * We only allow files that the browser/device
         * identifies as images.
         *
         * Sharp will perform the actual image validation
         * and normalization later in the RescueAI pipeline.
         */

        if (
            typeof file.mimetype === "string" &&
            file.mimetype.toLowerCase().startsWith("image/")
        ) {

            cb(null, true);

        } else {

            cb(
                new Error(
                    "Only image files are allowed."
                )
            );

        }

    }

});


module.exports = upload;