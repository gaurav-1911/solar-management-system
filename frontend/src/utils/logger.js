/**
 * Centralized Frontend Logger Utility
 * Production-safe logger that suppresses debug output in production environments.
 */

const isProduction =
  typeof process !== "undefined" && process.env?.NODE_ENV === "production";

export const logger = {
  info: (...args) => {
    if (!isProduction) {
      console.log("[INFO]:", ...args);
    }
  },

  warn: (...args) => {
    if (!isProduction) {
      console.warn("[WARN]:", ...args);
    }
  },

  error: (...args) => {
    console.error("[ERROR]:", ...args);
  },

  debug: (...args) => {
    if (!isProduction) {
      console.debug("[DEBUG]:", ...args);
    }
  },
};

export default logger;
