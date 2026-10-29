const express = require("express");
const asyncHandler = require("../utils/asyncHandler");
const { requireAuth, requireRole } = require("../middleware/auth");
const { doubleCsrfProtection } = require("../middleware/csrf");
const {
  mySchedule,
  myPatients,
  getPatientChart,
  createConsultation,
  updateAppointmentStatus,
  addAvailabilityOverride,
  removeAvailabilityOverride
} = require("../controllers/doctor.controller");

const router = express.Router();

// chief is included because the chief doctor also practices (see doctor.controller.js).
router.use(requireAuth, requireRole("doctor", "chief"));

router.get("/schedule", asyncHandler(mySchedule));
router.get("/patients", asyncHandler(myPatients));
router.get("/patients/:patientId", asyncHandler(getPatientChart));
router.post("/consultations", doubleCsrfProtection, asyncHandler(createConsultation));
router.patch("/appointments/:id/status", doubleCsrfProtection, asyncHandler(updateAppointmentStatus));
router.post("/availability", doubleCsrfProtection, asyncHandler(addAvailabilityOverride));
router.delete("/availability/:id", doubleCsrfProtection, asyncHandler(removeAvailabilityOverride));

module.exports = router;
