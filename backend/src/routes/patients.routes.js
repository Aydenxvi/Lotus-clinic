const express = require("express");
const asyncHandler = require("../utils/asyncHandler");
const { requireAuth, requireRole } = require("../middleware/auth");
const { doubleCsrfProtection } = require("../middleware/csrf");
const { getProfile, updateProfile, myMedicalRecord, myConsultations } = require("../controllers/patients.controller");

const router = express.Router();

router.use(requireAuth, requireRole("patient"));

router.get("/me", asyncHandler(getProfile));
router.patch("/me", doubleCsrfProtection, asyncHandler(updateProfile));
router.get("/me/medical-record", asyncHandler(myMedicalRecord));
router.get("/me/consultations", asyncHandler(myConsultations));

module.exports = router;
