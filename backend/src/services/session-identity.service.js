// Validate a stored session against the current database identity.
// Important: an administrator may deactivate a user or change their role
// while the browser still holds a previously valid session cookie.
function matchesSessionIdentity(sessionUser, dbUser) {
  if (!sessionUser || !dbUser || !dbUser.active) return false;
  if (String(sessionUser.id || "") !== String(dbUser.id)) return false;
  if (sessionUser.role !== dbUser.role) return false;

  if (dbUser.role === "patient") {
    return Boolean(dbUser.patient &&
      String(sessionUser.patientId || "") === String(dbUser.patient.id));
  }
  if (dbUser.role === "doctor" || dbUser.role === "chief") {
    // Some admin-only chief accounts can exist without a doctor relation.
    if (!dbUser.doctor) {
      return dbUser.role === "chief" && !sessionUser.doctorId;
    }
    return dbUser.doctor.active !== false &&
      String(sessionUser.doctorId || "") === String(dbUser.doctor.id);
  }
  return false;
}

function sessionUserId(sessionUser) {
  const raw = String((sessionUser && sessionUser.id) || "");
  if (!/^\d{1,20}$/.test(raw)) return null;
  try { return BigInt(raw); } catch (_) { return null; }
}

module.exports = { matchesSessionIdentity, sessionUserId };
