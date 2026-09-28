import fs from "fs";
import path from "path";

/**
 * Centralized Backend Logger Utility
 * Provides structured, environment-aware logging with timestamps, log levels,
 * and automatic physical `logs/` directory & file creation (error.log, combined.log).
 */

const LOG_DIR = path.resolve(process.cwd(), "logs");

// Auto-create physical `logs/` directory on startup if it doesn't exist
try {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
} catch (err) {
  console.error("Failed to create logs directory:", err);
}

const ERROR_LOG_PATH = path.join(LOG_DIR, "error.log");
const COMBINED_LOG_PATH = path.join(LOG_DIR, "combined.log");

const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3,
};

const currentLevel = process.env.NODE_ENV === "production" ? LOG_LEVELS.INFO : LOG_LEVELS.DEBUG;

const formatTime = () => new Date().toISOString();

const formatArgs = (args) => {
  return args
    .map((arg) => {
      if (arg instanceof Error) {
        return `${arg.message}\n${arg.stack}`;
      }
      if (typeof arg === "object") {
        try {
          return JSON.stringify(arg, null, 2);
        } catch {
          return String(arg);
        }
      }
      return String(arg);
    })
    .join(" ");
};

const writeToFile = (filePath, logLine) => {
  try {
    fs.appendFileSync(filePath, logLine + "\n", "utf8");
  } catch (e) {
    // Fail silently if disk is unwriteable
  }
};

export const logger = {
  info: (...args) => {
    if (currentLevel >= LOG_LEVELS.INFO) {
      const line = `[${formatTime()}] [INFO]: ${formatArgs(args)}`;
      console.log(line);
      writeToFile(COMBINED_LOG_PATH, line);
    }
  },

  warn: (...args) => {
    if (currentLevel >= LOG_LEVELS.WARN) {
      const line = `[${formatTime()}] [WARN]: ${formatArgs(args)}`;
      console.warn(line);
      writeToFile(COMBINED_LOG_PATH, line);
    }
  },

  error: (...args) => {
    if (currentLevel >= LOG_LEVELS.ERROR) {
      const line = `[${formatTime()}] [ERROR]: ${formatArgs(args)}`;
      console.error(line);
      writeToFile(COMBINED_LOG_PATH, line);
      writeToFile(ERROR_LOG_PATH, line);
    }
  },

  debug: (...args) => {
    if (currentLevel >= LOG_LEVELS.DEBUG) {
      const line = `[${formatTime()}] [DEBUG]: ${formatArgs(args)}`;
      console.log(line);
      writeToFile(COMBINED_LOG_PATH, line);
    }
  },
};

export default logger;
