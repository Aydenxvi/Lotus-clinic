const session = require("express-session");
const MySQLStore = require("express-mysql-session")(session);
const env = require("./env");

// express-mysql-session needs its own plain mysql2 connection details; Prisma's
// client doesn't expose a raw pool we can hand to it, so we parse DATABASE_URL
// once here. This store gives us real, persistent, server-side sessions backed
// by MySQL (a `sessions` table it creates automatically) instead of an in-memory
// store that would forget every login on restart / lose sessions across multiple
// backend instances on Railway.
function parseDatabaseUrl(url) {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: Number(u.port || 3306),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, "")
  };
}

const sessionStore = new MySQLStore({
  ...parseDatabaseUrl(env.databaseUrl),
  createDatabaseTable: true,
  clearExpired: true,
  checkExpirationInterval: 15 * 60 * 1000, // 15 min
  expiration: 60 * 60 * 1000, // 1 hour, matches cookie maxAge below
  schema: {
    tableName: "sessions",
    columnNames: {
      session_id: "session_id",
      expires: "expires",
      data: "data"
    }
  }
});

const sessionMiddleware = session({
  name: "lotus.sid",
  secret: env.sessionSecret,
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    secure: env.cookieSecure, // true in production behind HTTPS (Railway)
    sameSite: env.cookieSecure ? "none" : "lax", // "lax" lets the Netlify frontend's top-level navigation/XHR work; switch to "none" (+ secure:true) only if frontend and API end up on fully different sites and you hit cross-site issues
    maxAge: 60 * 60 * 1000 // 1 hour
  }
});

module.exports = { sessionMiddleware, sessionStore };

