 import multer from "multer";
import path from "path";
import fs from "fs";

const uploadDir = "uploads";

if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

const storage = multer.diskStorage({
    destination(req, file, cb) {
        cb(null, uploadDir);
    },

    filename(req, file, cb) {
        cb(
            null,
            Date.now() +
                "-" +
                Math.round(Math.random() * 1e9) +
                path.extname(file.originalname)
        );
    },
});

const fileFilter = (req, file, cb) => {

    if (file.mimetype.startsWith("audio/")) {
        cb(null, true);
    } else {
        cb(new Error("Only audio files are allowed."));
    }

};

const upload = multer({

    storage,

    limits: {
        fileSize: 10 * 1024 * 1024, //10MB
    },

    fileFilter,

});

export default upload;