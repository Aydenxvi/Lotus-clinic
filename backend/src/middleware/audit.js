const { prisma } = require("../config/db");

// Fire-and-forget audit logging. Never throws into the request path — an audit
// log failure must not break the user-facing action it's recording.
async function recordAudit({ userId, action, targetType, targetId, meta, ip }) {
  try {
    await prisma.auditLog.create({
      data: {
        userId: userId ? BigInt(userId) : null,
        action,
        targetType: targetType || null,
        targetId: targetId != null ? String(targetId) : null,
        meta: meta || undefined,
        ip: ip || null
      }
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[audit-log-failed]", action, e.message);
  }
}

// Express middleware factory: attaches req.audit(action, targetType, targetId, meta)
// so controllers can log without importing Prisma directly.
function auditMiddleware(req, res, next) {
  req.audit = (action, targetType, targetId, meta) =>
    recordAudit({
      userId: req.user ? req.user.id : null,
      action,
      targetType,
      targetId,
      meta,
      ip: req.ip
    });
  next();
}

module.exports = { auditMiddleware, recordAudit };
