// RBAC core. req.session.user is set only by the login controller, straight from
// the `users` table — a client can never set or change it, and the role is never
// read from the request body. Every protected route must list requireAuth first,
// then requireRole(...) if it needs to.

function requireAuth(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  req.user = req.session.user; // { id, role, username, doctorId?, patientId? }
  next();
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

// A doctor may only act on their OWN patients/appointments; chief bypasses the check.
// Always resolve the scoping id from the server-side session, never from the URL.
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
