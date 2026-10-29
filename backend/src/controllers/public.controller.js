const { z } = require("zod");
const { prisma } = require("../config/db");
const { ApiError } = require("../middleware/errorHandler");
const { getAvailableSlots } = require("../services/slot.service");

// Shapes doctor/department rows to match the field names the existing frontend
// (js/data.js) already expects, so booking.js / doctors.html / etc. need only
// swap "LOTUS.doctors" for an API call rather than being rewritten line by line.
function shapeDoctor(d) {
  return {
    id: d.id,
    name: d.name,
    title: d.title,
    dept: d.departmentId,
    exp: d.exp,
    rating: d.rating ? Number(d.rating) : null,
    reviews: d.reviewsCount,
    langs: d.langs || [],
    price: d.price,
    ageGroup: d.ageGroup,
    bio: d.bio,
    initials: d.initials,
    badge: d.badge,
    specialRole: d.specialRole,
    specialNote: d.specialNote,
    education: d.education || null,
    reviewsList: d.reviewsList || []
  };
}

function shapeDepartment(dep) {
  return {
    id: dep.id,
    name: dep.name,
    tag: dep.tag,
    icon: dep.icon,
    wait: dep.wait,
    hours: dep.hours,
    desc: dep.desc,
    services: dep.servicesTags || [],
    symptoms: dep.symptoms || [],
    equipment: dep.equipment,
    checkups: dep.checkups || [],
    prices: (dep.serviceRows || []).map((s) => ({ name: s.name, price: s.priceLabel }))
  };
}

async function listDoctors(req, res) {
  const doctors = await prisma.doctor.findMany({ where: { active: true }, orderBy: { name: "asc" } });
  res.json({ doctors: doctors.map(shapeDoctor) });
}

async function getDoctor(req, res) {
  const doctor = await prisma.doctor.findUnique({ where: { id: req.params.id } });
  if (!doctor || !doctor.active) throw new ApiError(404, "Doctor not found");
  res.json({ doctor: shapeDoctor(doctor) });
}

async function listDepartments(req, res) {
  const departments = await prisma.department.findMany({
    where: { active: true },
    include: { services: { where: { active: true } } },
    orderBy: { name: "asc" }
  });
  res.json({
    departments: departments.map((d) => shapeDepartment({ ...d, serviceRows: d.services }))
  });
}

async function getDepartment(req, res) {
  const dep = await prisma.department.findUnique({
    where: { id: req.params.id },
    include: { services: { where: { active: true } } }
  });
  if (!dep || !dep.active) throw new ApiError(404, "Department not found");
  res.json({ department: shapeDepartment({ ...dep, serviceRows: dep.services }) });
}

const slotsQuerySchema = z.object({
  from: z.string().optional(),
  days: z.coerce.number().int().min(1).max(60).optional()
});

async function availableSlots(req, res) {
  const doctor = await prisma.doctor.findUnique({ where: { id: req.params.id } });
  if (!doctor || !doctor.active) throw new ApiError(404, "Doctor not found");

  const { from, days } = slotsQuerySchema.parse(req.query);
  const fromDate = from ? new Date(from) : new Date();
  const toDate = new Date(fromDate.getTime() + (days || 14) * 24 * 60 * 60 * 1000);

  const slots = await getAvailableSlots(doctor.id, fromDate, toDate);
  res.json({
    doctorId: doctor.id,
    slots: slots.map((s) => ({ id: s.id.toString(), slotAt: s.slotAt.toISOString() }))
  });
}

module.exports = { listDoctors, getDoctor, listDepartments, getDepartment, availableSlots };
