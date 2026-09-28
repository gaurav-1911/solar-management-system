if (process.env.NODE_ENV === "production" && !process.env.JWT_SECRET) {
  throw new Error("FATAL: JWT_SECRET must be set in production");
}

export const DEFAULT_JWT_SECRET = "default_jwt_secret";
export const DEFAULT_JWT_EXPIRE = "7d"; // Access Token: default 7 days

export const DEFAULT_JWT_REFRESH_SECRET = "default_jwt_refresh_secret";
export const DEFAULT_JWT_REFRESH_EXPIRE = "7d"; // Refresh Token: default 7 days

export const getJwtExpire = () => {
  const raw = String(process.env.JWT_EXPIRE || "").trim();
  if (!raw) return DEFAULT_JWT_EXPIRE;
  if (/^\d+$/.test(raw)) return `${raw}d`;
  return raw;
};

export const getJwtRefreshExpire = () => {
  const raw = String(process.env.JWT_REFRESH_EXPIRE || "").trim();
  if (!raw) return DEFAULT_JWT_REFRESH_EXPIRE;
  if (/^\d+$/.test(raw)) return `${raw}d`;
  return raw;
};


