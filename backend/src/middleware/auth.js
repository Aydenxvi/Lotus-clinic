// Role checks are enforced at the API boundary. Session claims are revalidated
// against the database on EVERY protected request. This immediately revokes
// access when an account is disabled, demoted or unlinked from its doctor.
const { prisma } = require("../config/db");
const { matchesSessionIdentity, sessionUserId } = require("../services/session-identity.service");

function unauthorized(req, res) {
  if (!req.session) return res.status(401).json({ error: "Not authenticated" });
  return req.session.destroy(() => {
    res.status(401).json({ error: "Not authenticated" });
  });
}

async function requireAuth(req, res, next) {
  const cached = req.session && req.session.user;
  if (!cached) return res.status(401).json({ error: "Not authenticated" });
  const id = sessionUserId(cached);
  if (!id) return unauthorized(req, res);
  try {
    const dbUser = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true, active: true, role: true,
        patient: { select: { id: true } },
        doctor: { select: { id: true, active: true } }
      }
    });
    if (!matchesSessionIdentity(cached, dbUser)) return unauthorized(req, res);
    req.user = cached;
    next();
  } catch (error) {
    next(error);
  }
}

function requireRole(...roles) {
  const allowed = roles.flat();
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "Not authenticated" });
    if (!allowed.includes(req.user.role)) {
      return res.status(403).json({ error: "You do not have permission to access this resource" });
    }
    next();
  };
}

function requireOwnDoctorOrChief(getDoctorIdFromReq) {
  return (req, res, next) => {
    if (req.user.role === "chief") return next();
    if (req.user.role !== "doctor" || !req.user.doctorId) {
      return res.status(403).json({ error: "You do not have permission to access this resource" });
    }
    const targetDoctorId = getDoctorIdFromReq(req);
    if (targetDoctorId && targetDoctorId !== req.user.doctorId) {
      return res.status(403).json({ error: "This record does not belong to your schedule" });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole, requireOwnDoctorOrChief };
