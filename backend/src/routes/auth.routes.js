const express = require("express");
const asyncHandler = require("../utils/asyncHandler");
const { register, login, logout, me } = require("../controllers/auth.controller");
const { authLimiter } = require("../middleware/rateLimit");
const { doubleCsrfProtection, issueCsrfToken } = require("../middleware/csrf");

const router = express.Router();

// The frontend fetches a CSRF token once (credentials included so the matching
// cookie is set), then sends it back as X-CSRF-Token on every unsafe request.
router.get("/csrf", issueCsrfToken);

router.post("/register", authLimiter, doubleCsrfProtection, asyncHandler(register));
router.post("/login", authLimiter, doubleCsrfProtection, asyncHandler(login));
router.post("/logout", doubleCsrfProtection, asyncHandler(logout));
router.get("/me", asyncHandler(me));

module.exports = router;
