import multer from "multer";

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB — adjust for real deployment

const ALLOWED_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "application/pdf",
  "video/mp4",
  "audio/mpeg",
  "audio/wav",
  "application/zip",
  "application/x-zip-compressed",
  "application/octet-stream", // disk images / forensic files
  "text/plain"
]);

const storage = multer.memoryStorage();

export const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (req, file, cb) => {
    // Backend validation — never trust that the frontend already checked this.
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      return cb(new Error(`File type not allowed: ${file.mimetype}`));
    }
    cb(null, true);
  }
});
