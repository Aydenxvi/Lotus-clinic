const express = require("express");
const asyncHandler = require("../utils/asyncHandler");
const { requireAuth, requireRole } = require("../middleware/auth");
const { doubleCsrfProtection } = require("../middleware/csrf");
const {
  createAppointment,
  myAppointments,
  patchAppointment,
  cancelAppointmentDelete
} = require("../controllers/appointments.controller");

const router = express.Router();

router.use(requireAuth, requireRole("patient"));

router.post("/", doubleCsrfProtection, asyncHandler(createAppointment));
router.get("/me", asyncHandler(myAppointments));
router.patch("/:id", doubleCsrfProtection, asyncHandler(patchAppointment));
router.delete("/:id", doubleCsrfProtection, asyncHandler(cancelAppointmentDelete));

module.exports = router;
