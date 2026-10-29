const express = require("express");
const asyncHandler = require("../utils/asyncHandler");
const {
  listDoctors,
  getDoctor,
  listDepartments,
  getDepartment,
  availableSlots
} = require("../controllers/public.controller");

const router = express.Router();

// All read-only and public by design: browsing doctors/departments and seeing
// free slots must not require an account, same as the original static site.
router.get("/doctors", asyncHandler(listDoctors));
router.get("/doctors/:id", asyncHandler(getDoctor));
router.get("/doctors/:id/available-slots", asyncHandler(availableSlots));
router.get("/departments", asyncHandler(listDepartments));
router.get("/departments/:id", asyncHandler(getDepartment));

module.exports = router;
