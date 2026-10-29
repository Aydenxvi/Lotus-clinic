const { doubleCsrf } = require("csrf-csrf");
const env = require("../config/env");

// Double-submit-cookie CSRF protection: the server sets a readable (non-HttpOnly)
// cookie with a signed token; the frontend must echo that token back in the
// X-CSRF-Token header on any state-changing request. A cross-site page can make
// the browser send cookies, but it cannot read this cookie's value to put it in
// the header, so a forged request fails.
const {
  generateToken,
  doubleCsrfProtection
} = doubleCsrf({  getSecret: () => env.csrfSecret,
  cookieName: env.isProd ? "__Host-lotus.csrf" : "lotus.csrf",
  cookieOptions: {
    httpOnly: false,
    secure: env.cookieSecure,
    sameSite: env.cookieSecure ? "none" : "lax",
    path: "/"
  },
  getSessionIdentifier: (req) => (req.session && req.session.id) || "anonymous",
  size: 64,
  ignoredMethods: ["GET", "HEAD", "OPTIONS"]
});

// GET /api/auth/csrf — the frontend calls this once on load to receive a token
// and must send it back as X-CSRF-Token on every POST/PATCH/DELETE.
function issueCsrfToken(req, res) {
  const token = generateToken(req, res);
  res.json({ csrfToken: token });
}

module.exports = { doubleCsrfProtection, issueCsrfToken };

