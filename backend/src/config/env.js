require("dotenv").config();

function required(name) {
  const v = process.env[name];
  if (!v) {
    // Fail fast and loudly rather than booting with a broken config.
    throw new Error(`Missing required environment variable: ${name}. Copy .env.example to .env and fill it in.`);
  }
  return v;
}

const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  isProd: process.env.NODE_ENV === "production",
  port: Number(process.env.PORT || 4000),
  databaseUrl: required("DATABASE_URL"),
  sessionSecret: required("SESSION_SECRET"),
  csrfSecret: required("CSRF_SECRET"),
  corsOrigins: (process.env.CORS_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  cookieSecure: String(process.env.COOKIE_SECURE).toLowerCase() === "true",
  seedDemoAccounts: String(process.env.SEED_DEMO_ACCOUNTS).toLowerCase() === "true"
};

module.exports = env;
