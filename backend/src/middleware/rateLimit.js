const rateLimit = require("express-rate-limit");

// Generic limiter for the whole API.
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please slow down and try again shortly." }
});

// Tighter limiter specifically on auth endpoints to blunt credential-stuffing /
// brute-force attempts against login and registration.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many authentication attempts. Please wait a few minutes and try again." }
});

module.exports = { apiLimiter, authLimiter };
