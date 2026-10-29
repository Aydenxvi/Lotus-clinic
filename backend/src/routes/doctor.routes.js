const express = require("express");
const asyncHandler = require("../utils/asyncHandler");
const { requireAuth, requireRole } = require("../middleware/auth");
const { doubleCsrfProtection } = require("../middleware/csrf");
const operations = require("../controllers/operations.controller");
const clinical = require("../controllers/clinical-operations.controller");
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

router.get("/labs", asyncHandler(clinical.listMyLabs));
router.get("/pharmacy", asyncHandler(clinical.getDoctorPharmacy));
router.post("/pharmacy/issues", doubleCsrfProtection, asyncHandler(clinical.issueMedicine));
router.get("/room", asyncHandler(operations.listMyRooms));
router.patch("/room/status", doubleCsrfProtection, asyncHandler(operations.updateMyRoomStatus));
router.get("/leaves", asyncHandler(operations.listMyLeaves));
router.post("/leaves", doubleCsrfProtection, asyncHandler(operations.createMyLeave));
router.get("/schedule", asyncHandler(mySchedule));
router.get("/patients", asyncHandler(myPatients));
router.get("/patients/:patientId", asyncHandler(getPatientChart));
router.post("/consultations", doubleCsrfProtection, asyncHandler(createConsultation));
router.patch("/appointments/:id/status", doubleCsrfProtection, asyncHandler(updateAppointmentStatus));
router.post("/availability", doubleCsrfProtection, asyncHandler(addAvailabilityOverride));
router.delete("/availability/:id", doubleCsrfProtection, asyncHandler(removeAvailabilityOverride));

module.exports = router;
