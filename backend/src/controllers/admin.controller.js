const { z } = require("zod");
const { prisma } = require("../config/db");
const { ApiError } = require("../middleware/errorHandler");
const { hashPassword } = require("../services/password.service");
const booking = require("../services/booking.service");

/* ------------------------------- doctors -------------------------------- */

async function listDoctors(req, res) {
  const doctors = await prisma.doctor.findMany({ include: { user: true, department: true }, orderBy: { name: "asc" } });
  res.json({ doctors: doctors.map(shapeDoctorAdmin) });
}

const createDoctorSchema = z.object({
  id: z.string().trim().min(1).max(40), // keep explicit ids (e.g. "d24") so they stay stable/readable
  name: z.string().trim().min(1).max(190),
  title: z.string().trim().max(190).optional(),
  departmentId: z.string().trim().min(1),
  exp: z.coerce.number().int().min(0).max(80).optional(),
  price: z.string().trim().max(40).optional(),
  ageGroup: z.string().trim().max(190).optional(),
  bio: z.string().trim().max(5000).optional(),
  initials: z.string().trim().max(10).optional(),
  badge: z.string().trim().max(190).optional(),
  gender: z.enum(["м", "ж"]).optional(),
  mobile: z.string().trim().max(40).optional(),
  idNum: z.string().trim().max(40).optional(),
  dob: z.string().optional(), // "YYYY-MM-DD"
  address: z.string().trim().max(2000).optional(),
  // Staff login is optional at creation time — many doctors in the original
  // demo data have no portal account at all, by design.
  username: z.string().trim().min(3).max(80).optional(),
  password: z.string().min(8).max(200).optional(),
  role: z.enum(["doctor", "chief"]).default("doctor")
});

// Staff accounts are created only here, behind requireRole("chief") in the
// router — never through the public /api/auth/register endpoint, and the
// role is always a value this endpoint sets, never one the request body for
// /api/auth/* can influence.
async function createDoctor(req, res) {
  const input = createDoctorSchema.parse(req.body);

  const dept = await prisma.department.findUnique({ where: { id: input.departmentId } });
  if (!dept) throw new ApiError(400, "Unknown departmentId");

  const data = {
    id: input.id,
    name: input.name,
    title: input.title,
    departmentId: input.departmentId,
    exp: input.exp,
    price: input.price,
    ageGroup: input.ageGroup,
    bio: input.bio,
    initials: input.initials,
    badge: input.badge,
    gender: input.gender,
    mobile: input.mobile,
    idNum: input.idNum,
    dob: input.dob ? new Date(input.dob) : undefined,
    address: input.address
  };

  if (input.username || input.password) {
    if (!input.username || !input.password) {
      throw new ApiError(400, "username and password must be provided together to create a staff login");
    }
    const passwordHash = await hashPassword(input.password);
    data.user = { create: { username: input.username, passwordHash, role: input.role } };
  }

  const doctor = await prisma.doctor.create({ data, include: { user: true, department: true } });
  await req.audit("create_doctor", "doctor", doctor.id, { departmentId: doctor.departmentId });
  res.status(201).json({ doctor: shapeDoctorAdmin(doctor) });
}

const updateDoctorSchema = createDoctorSchema.partial().omit({ id: true });

async function updateDoctor(req, res) {
  const id = req.params.id;
  const input = updateDoctorSchema.parse(req.body);
  const existing = await prisma.doctor.findUnique({ where: { id } });
  if (!existing) throw new ApiError(404, "Doctor not found");

  const data = {
    name: input.name,
    title: input.title,
    department: input.departmentId
  ? { connect: { id: input.departmentId } }
  : undefined,
    exp: input.exp,
    price: input.price,
    ageGroup: input.ageGroup,
    bio: input.bio,
    initials: input.initials,
    badge: input.badge,
    gender: input.gender,
    mobile: input.mobile,
    idNum: input.idNum,
    dob: input.dob ? new Date(input.dob) : undefined,
    address: input.address
  };

  if (input.username || input.password) {
    const passwordHash = input.password ? await hashPassword(input.password) : undefined;
    if (existing.userId) {
      await prisma.user.update({
        where: { id: existing.userId },
        data: { username: input.username, ...(passwordHash ? { passwordHash } : {}) }
      });
    } else {
      if (!input.username || !input.password) {
        throw new ApiError(400, "username and password must be provided together to create a staff login");
      }
      data.user = { create: { username: input.username, passwordHash: await hashPassword(input.password), role: input.role || "doctor" } };
    }
  }

  const doctor = await prisma.doctor.update({ where: { id }, data, include: { user: true, department: true } });
  await req.audit("update_doctor", "doctor", id);
  res.json({ doctor: shapeDoctorAdmin(doctor) });
}

// "Deactivate" rather than hard-delete: preserves appointment/consultation
// history (medical records must not disappear) while removing the doctor
// from public listings and disabling their login.
async function deactivateDoctor(req, res) {
  const id = req.params.id;
  const existing = await prisma.doctor.findUnique({ where: { id } });
  if (!existing) throw new ApiError(404, "Doctor not found");

  await prisma.$transaction(async (tx) => {
    await tx.doctor.update({ where: { id }, data: { active: false } });
    if (existing.userId) {
      await tx.user.update({ where: { id: existing.userId }, data: { active: false } });
    }
  });
  await req.audit("deactivate_doctor", "doctor", id);
  res.json({ ok: true });
}

function shapeDoctorAdmin(d) {
  return {
    id: d.id,
    name: d.name,
    title: d.title,
    departmentId: d.departmentId,
    departmentName: d.department ? d.department.name : undefined,
    active: d.active,
    gender: d.gender,
    mobile: d.mobile,
    idNum: d.idNum,
    dob: d.dob ? d.dob.toISOString().slice(0, 10) : null,
    address: d.address,
    username: d.user ? d.user.username : null,
    role: d.user ? d.user.role : null,
    userActive: d.user ? d.user.active : null
  };
}

/* ------------------------------- patients -------------------------------- */

async function listPatients(req, res) {
  const q = (req.query.q || "").toString().trim().toLowerCase();
  const patients = await prisma.patient.findMany({
    include: { user: true },
    orderBy: { createdAt: "desc" },
    take: 500
  });
  const filtered = q
    ? patients.filter((p) =>
        `${p.firstName} ${p.lastName || ""} ${p.phone} ${p.email || ""}`.toLowerCase().includes(q)
      )
    : patients;
  res.json({
    patients: filtered.map((p) => ({
      id: p.id.toString(),
      firstName: p.firstName,
      lastName: p.lastName,
      phone: p.phone,
      email: p.email,
      active: p.user ? p.user.active : null,
      userId: p.userId.toString()
    }))
  });
}

/* ------------------------------ schedules -------------------------------- */

const templateSchema = z.object({
  weekday: z.coerce.number().int().min(0).max(6),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  slotMinutes: z.coerce.number().int().min(5).max(240).default(30),
  slotsPerDay: z.coerce.number().int().min(1).max(50).default(1)
});

async function listScheduleTemplates(req, res) {
  const doctorId = req.params.id;
  const templates = await prisma.doctorScheduleTemplate.findMany({ where: { doctorId }, orderBy: { weekday: "asc" } });
  res.json({ templates: templates.map((t) => ({ ...t, id: t.id.toString() })) });
}

async function addScheduleTemplate(req, res) {
  const doctorId = req.params.id;
  const doctor = await prisma.doctor.findUnique({ where: { id: doctorId } });
  if (!doctor) throw new ApiError(404, "Doctor not found");
  const input = templateSchema.parse(req.body);
  const template = await prisma.doctorScheduleTemplate.create({ data: { doctorId, ...input } });
  await req.audit("add_schedule_template", "doctor", doctorId, input);
  res.status(201).json({ template: { ...template, id: template.id.toString() } });
}

async function removeScheduleTemplate(req, res) {
  const id = BigInt(req.params.templateId);
  const existing = await prisma.doctorScheduleTemplate.findUnique({ where: { id } });
  if (!existing || existing.doctorId !== req.params.id) throw new ApiError(404, "Template not found");
  await prisma.doctorScheduleTemplate.delete({ where: { id } });
  await req.audit("remove_schedule_template", "doctor", req.params.id, { id: id.toString() });
  res.json({ ok: true });
}

/* ----------------------------- departments -------------------------------- */

async function listDepartments(req, res) {
  const departments = await prisma.department.findMany({ orderBy: { name: "asc" } });
  res.json({ departments });
}

const departmentUpdateSchema = z.object({
  name: z.string().trim().min(1).max(190).optional(),
  tag: z.string().trim().max(80).optional(),
  hours: z.string().trim().max(190).optional(),
  desc: z.string().trim().max(5000).optional(),
  active: z.boolean().optional()
});

async function updateDepartment(req, res) {
  const id = req.params.id;
  const input = departmentUpdateSchema.parse(req.body);
  const dept = await prisma.department.update({ where: { id }, data: input });
  await req.audit("update_department", "department", id);
  res.json({ department: dept });
}

/* ----------------------------- appointments -------------------------------- */

async function listAppointments(req, res) {
  const { doctorId, status, from, to } = req.query;
  const where = {};
  if (doctorId) where.doctorId = String(doctorId);
  if (status) where.status = String(status);
  if (from || to) where.scheduledAt = { ...(from ? { gte: new Date(String(from)) } : {}), ...(to ? { lte: new Date(String(to)) } : {}) };

  const appointments = await prisma.appointment.findMany({
    where,
    include: { doctor: true, patient: true },
    orderBy: { scheduledAt: "desc" },
    take: 500
  });
  res.json({
    appointments: appointments.map((a) => ({
      id: a.id.toString(),
      status: a.status,
      scheduledAt: a.scheduledAt.toISOString(),
      reason: a.reason,
      doctor: { id: a.doctor.id, name: a.doctor.name },
      patient: { id: a.patient.id.toString(), firstName: a.patient.firstName, lastName: a.patient.lastName, phone: a.patient.phone }
    }))
  });
}

const adminStatusSchema = z.object({ status: z.enum(["pending", "confirmed", "completed", "cancelled", "no_show"]) });

async function updateAppointment(req, res) {
  const { status } = adminStatusSchema.parse(req.body);
  const appointment = await booking.setAppointmentStatus({ appointmentId: BigInt(req.params.id), status });
  await req.audit("admin_update_appointment", "appointment", appointment.id, { status });
  res.json({ appointment: { ...appointment, id: appointment.id.toString() } });
}

/* -------------------------------- stats ----------------------------------- */

async function stats(req, res) {
  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

  const [doctorsCount, patientsCount, todayCount, pendingCount, byStatus] = await Promise.all([
    prisma.doctor.count({ where: { active: true } }),
    prisma.patient.count(),
    prisma.appointment.count({ where: { scheduledAt: { gte: startOfDay, lt: endOfDay } } }),
    prisma.appointment.count({ where: { status: "pending" } }),
    prisma.appointment.groupBy({ by: ["status"], _count: { _all: true } })
  ]);

  res.json({
    doctors: doctorsCount,
    patients: patientsCount,
    appointmentsToday: todayCount,
    pendingAppointments: pendingCount,
    appointmentsByStatus: Object.fromEntries(byStatus.map((r) => [r.status, r._count._all]))
  });
}

/* --------------------------------- users ----------------------------------- */

const userUpdateSchema = z.object({
  active: z.boolean().optional(),
  role: z.enum(["patient", "doctor", "chief"]).optional()
});

// Deliberate admin action only — this is the one place a role can ever
// change, and it is always the chief doing it to someone else's account,
// never a user acting on their own.
async function updateUser(req, res) {
  const id = BigInt(req.params.id);
  const input = userUpdateSchema.parse(req.body);
  if (id === BigInt(req.user.id) && input.role) {
    throw new ApiError(400, "You cannot change your own role");
  }
  const user = await prisma.user.update({ where: { id }, data: input });
  await req.audit("admin_update_user", "user", id, input);
  res.json({ user: { id: user.id.toString(), username: user.username, role: user.role, active: user.active } });
}

async function listAuditLogs(req, res) {
  const logs = await prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 200 });
  res.json({
    logs: logs.map((l) => ({
      id: l.id.toString(),
      userId: l.userId ? l.userId.toString() : null,
      action: l.action,
      targetType: l.targetType,
      targetId: l.targetId,
      meta: l.meta,
      createdAt: l.createdAt.toISOString()
    }))
  });
}

module.exports = {
  listDoctors,
  createDoctor,
  updateDoctor,
  deactivateDoctor,
  listScheduleTemplates,
  addScheduleTemplate,
  removeScheduleTemplate,
  listDepartments,
  updateDepartment,
  listAppointments,
  updateAppointment,
  stats,
  updateUser,
  listAuditLogs,
  listPatients
};
