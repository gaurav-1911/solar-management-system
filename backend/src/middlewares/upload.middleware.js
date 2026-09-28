import multer from "multer";

/**
 * Universal Reusable Multer Upload Middleware Suite
 * Manages file memory/disk storage, file size/count limits, MIME type filtering,
 * error handling, and JSON body expansion for multipart/form-data requests.
 */

const DEFAULT_MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB

/**
 * Middleware to parse JSON string payload inside `req.body.data`
 * (common in multipart forms with complex nested form fields).
 */
export const expandJsonBody = (req, res, next) => {
  if (req.body && typeof req.body.data === "string") {
    try {
      req.body = { ...req.body, ...JSON.parse(req.body.data) };
      delete req.body.data;
    } catch (e) {
      return res.status(400).json({
        success: false,
        message: "Invalid JSON format in 'data' form field.",
      });
    }
  }
  next();
};

/**
 * Creates a reusable Multer upload middleware with standardized error handling.
 *
 * @param {Array|Object} fieldsConfig Field configurations for multer (e.g. [{ name: 'file', maxCount: 1 }])
 * @param {Object} options
 * @param {number} options.maxFileSize Maximum file size in bytes (default: 25MB)
 * @param {Object|Array} options.allowedMime Allowed MIME types map or array
 * @param {Object} options.storage Multer storage engine (default: memoryStorage)
 * @param {boolean} options.expandBody Auto-expand req.body.data JSON string (default: true)
 */
export const createUploadMiddleware = (fieldsConfig, options = {}) => {
  const {
    maxFileSize = DEFAULT_MAX_FILE_SIZE,
    allowedMime = null,
    storage = multer.memoryStorage(),
    expandBody = true,
  } = options;

  const upload = multer({
    storage,
    limits: { fileSize: maxFileSize },
    fileFilter: (req, file, cb) => {
      if (!allowedMime) return cb(null, true);

      let allowedList = [];
      if (Array.isArray(allowedMime)) {
        allowedList = allowedMime;
      } else if (typeof allowedMime === "object" && allowedMime[file.fieldname]) {
        allowedList = allowedMime[file.fieldname];
      }

      if (allowedList.length === 0 || allowedList.includes(file.mimetype)) {
        return cb(null, true);
      }

      return cb(
        new Error(
          `Invalid file format for '${file.fieldname}'. Allowed formats: ${allowedList.map((m) => m.split("/")[1]?.toUpperCase()).join(", ")}`
        )
      );
    },
  });

  const getMulterHandler = () => {
    if (Array.isArray(fieldsConfig)) {
      return upload.fields(fieldsConfig);
    }
    if (typeof fieldsConfig === "string") {
      return upload.single(fieldsConfig);
    }
    if (typeof fieldsConfig === "object" && fieldsConfig.name) {
      return upload.array(fieldsConfig.name, fieldsConfig.maxCount || 10);
    }
    return upload.any();
  };

  const handler = getMulterHandler();

  return (req, res, next) => {
    handler(req, res, (err) => {
      if (err) {
        let message = err.message;
        if (err.code === "LIMIT_FILE_SIZE") {
          message = `File too large. Maximum allowed size is ${Math.round(maxFileSize / (1024 * 1024))}MB per file.`;
        } else if (err.code === "LIMIT_UNEXPECTED_FILE") {
          message = `Unexpected file field or maximum file count limit exceeded for field '${err.field || "upload"}'.`;
        } else if (err.code === "LIMIT_FILE_COUNT") {
          message = `Maximum file count limit exceeded.`;
        }

        return res.status(400).json({
          success: false,
          message,
        });
      }

      if (expandBody) {
        expandJsonBody(req, res, next);
      } else {
        next();
      }
    });
  };
};

export default createUploadMiddleware;
