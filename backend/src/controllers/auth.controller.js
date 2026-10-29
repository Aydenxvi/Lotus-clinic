const { z } = require("zod");
const { prisma } = require("../config/db");
const { hashPassword, verifyPassword } = require("../services/password.service");
const { ApiError } = require("../middleware/errorHandler");
const { recordAudit } = require("../middleware/audit");

const registerSchema = z.object({
  firstName: z.string().trim().min(1).max(120),
  lastName: z.string().trim().max(120).optional(),
  phone: z.string().trim().min(5).max(40),
  email: z.string().trim().email().max(190).optional().or(z.literal("")),
  password: z.string().min(8).max(200),
 consent: z.literal(true, { error: "Consent to data processing is required" })
});

// Patients self-register. Role is hard-coded to "patient" here — it is never
// read from the request body, so a client cannot register themselves as staff.
async function register(req, res) {
  const input = registerSchema.parse(req.body);
  const phone = input.phone.trim();
  const email = input.email ? input.email.trim().toLowerCase() : null;

  const existing = await prisma.user.findFirst({
    where: { OR: [{ phone }, email ? { email } : undefined].filter(Boolean) }
  });
  if (existing) {
    throw new ApiError(409, "An account with this phone or email already exists. Please log in instead.");
  }

  const passwordHash = await hashPassword(input.password);
  const user = await prisma.user.create({
    data: {
      phone,
      email,
      passwordHash,
      role: "patient",
      patient: {
        create: {
          firstName: input.firstName.trim(),
          lastName: input.lastName ? input.lastName.trim() : null,
          phone,
          email,
          consentAt: new Date()
        }
      }
    },
    include: { patient: true }
  });

  await recordAudit({ userId: user.id, action: "register", targetType: "user", targetId: user.id, meta: { role: "patient" }, ip: req.ip });
  setSessionUser(req, user, user.patient);
  res.status(201).json({ user: publicUser(user, user.patient) });
}

const loginSchema = z.object({
  login: z.string().trim().min(1), // phone, email, or staff username
  password: z.string().min(1)
});

async function login(req, res) {
  const { login: loginValue, password } = loginSchema.parse(req.body);
  const key = loginValue.trim().toLowerCase();

  const user = await prisma.user.findFirst({
    where: {
      active: true,
      OR: [{ username: loginValue.trim() }, { email: key }, { phone: loginValue.trim() }]
    },
    include: { patient: true, doctor: true }
  });

  // Constant-shaped response whether the user exists or the password is wrong,
  // so the API doesn't leak which accounts exist.
  const genericError = () => new ApiError(401, "Invalid login or password");
  if (!user) throw genericError();

  const ok = await verifyPassword(user.passwordHash, password);
  if (!ok) {
    await recordAudit({ userId: user.id, action: "login_failed", targetType: "user", targetId: user.id, ip: req.ip });
    throw genericError();
  }

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await recordAudit({ userId: user.id, action: "login", targetType: "user", targetId: user.id, meta: { role: user.role }, ip: req.ip });
  setSessionUser(req, user, user.patient, user.doctor);
  res.json({ user: publicUser(user, user.patient, user.doctor) });
}

async function logout(req, res) {
  const userId = req.session && req.session.user ? req.session.user.id : null;
  const ip = req.ip;
  req.session.destroy((err) => {
    if (err) return res.status(500).json({ error: "Could not log out" });
    res.clearCookie("lotus.sid");
    if (userId) recordAudit({ userId, action: "logout", ip });
    res.json({ ok: true });
  });
}

// Returns the same shape as /auth/login and /auth/register (nested patient /
// doctor objects), refreshed from the DB rather than just echoing the
// session cache — so a patient's name edit (PATCH /api/patients/me) is
// reflected immediately without forcing a re-login.
async function me(req, res) {
  if (!req.session || !req.session.user) return res.status(401).json({ error: "Not authenticated" });
  const sessionUser = req.session.user;
  const user = await prisma.user.findUnique({
    where: { id: BigInt(sessionUser.id) },
    include: { patient: true, doctor: true }
  });
  if (!user || !user.active) {
    req.session.destroy(() => {});
    return res.status(401).json({ error: "Not authenticated" });
  }
  res.json({ user: publicUser(user, user.patient, user.doctor) });
}

function setSessionUser(req, user, patient, doctor) {
  req.session.user = {
    id: user.id.toString(),
    role: user.role,
    username: user.username || null,
    patientId: patient ? patient.id.toString() : null,
    doctorId: doctor ? doctor.id : null,
    name: patient ? [patient.firstName, patient.lastName].filter(Boolean).join(" ") : doctor ? doctor.name : null
  };
}

function publicUser(user, patient, doctor) {
  return {
    id: user.id.toString(),
    role: user.role,
    username: user.username || null,
    patient: patient
      ? {
          id: patient.id.toString(),
          firstName: patient.firstName,
          lastName: patient.lastName,
          phone: patient.phone,
          email: patient.email
        }
      : null,
    doctor: doctor ? { id: doctor.id, name: doctor.name, departmentId: doctor.departmentId } : null
  };
}

module.exports = { register, login, logout, me };
