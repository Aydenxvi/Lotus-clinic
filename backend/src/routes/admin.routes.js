const express = require("express");
const asyncHandler = require("../utils/asyncHandler");
const { requireAuth, requireRole } = require("../middleware/auth");
const { doubleCsrfProtection } = require("../middleware/csrf");
const admin = require("../controllers/admin.controller");
const operations = require("../controllers/operations.controller");

const router = express.Router();

// Everything here is chief-only. This is the enforcement point the RBAC
// blueprint calls out explicitly: POST /api/admin/doctors (staff creation)
// must sit behind requireRole(["chief"]) at the route level, not just be
// hidden in the UI, or a direct API call would let anyone register staff.
router.use(requireAuth, requireRole("chief"));

router.get("/rooms", asyncHandler(operations.listAdminRooms));
router.patch("/rooms/:id", doubleCsrfProtection, asyncHandler(operations.updateAdminRoom));
router.get("/leaves", asyncHandler(operations.listAdminLeaves));
router.patch("/leaves/:id", doubleCsrfProtection, asyncHandler(operations.reviewLeave));
router.get("/doctors", asyncHandler(admin.listDoctors));
router.post("/doctors", doubleCsrfProtection, asyncHandler(admin.createDoctor));
router.patch("/doctors/:id", doubleCsrfProtection, asyncHandler(admin.updateDoctor));
router.delete("/doctors/:id", doubleCsrfProtection, asyncHandler(admin.deactivateDoctor));

router.get("/doctors/:id/schedule-template", asyncHandler(admin.listScheduleTemplates));
router.post("/doctors/:id/schedule-template", doubleCsrfProtection, asyncHandler(admin.addScheduleTemplate));
router.delete("/doctors/:id/schedule-template/:templateId", doubleCsrfProtection, asyncHandler(admin.removeScheduleTemplate));

router.get("/departments", asyncHandler(admin.listDepartments));
router.patch("/departments/:id", doubleCsrfProtection, asyncHandler(admin.updateDepartment));

router.get("/appointments", asyncHandler(admin.listAppointments));
router.patch("/appointments/:id", doubleCsrfProtection, asyncHandler(admin.updateAppointment));

router.get("/stats", asyncHandler(admin.stats));
router.get("/patients", asyncHandler(admin.listPatients));
router.patch("/users/:id", doubleCsrfProtection, asyncHandler(admin.updateUser));
router.get("/audit-logs", asyncHandler(admin.listAuditLogs));

module.exports = router;
