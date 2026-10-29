// Chief physician's aggregate dashboard. Data is available exclusively via
// /api/admin/treatment behind requireRole("chief"). Never accepts patient IDs.
const { z } = require("zod");
const { prisma } = require("../config/db");
const { ApiError } = require("../middleware/errorHandler");

const querySchema = z.object({
  days: z.coerce.number().int().min(1).max(30).optional().default(7)
}).strict();

async function listTreatment(req, res) {
  const { days } = querySchema.parse(req.query);
  const to = new Date();
  const from = new Date(to.getTime() - days * 86400000);
  const appointments = await prisma.appointment.findMany({
    where: { scheduledAt: { gte: from, lte: to } },
    include: {
      patient: { select: { firstName: true, lastName: true } },
      doctor: { select: { name: true } },
      consultation: { include: { prescriptions: { select: { id: true } } } },
      _count: { select: { labOrders: true } }
    },
    orderBy: { scheduledAt: "desc" }, take: 500
  });
  const rows = appointments.map(a => ({
    appointmentId: a.id.toString(),
    scheduledAt: a.scheduledAt.toISOString(),
    patient: [a.patient.firstName, a.patient.lastName].filter(Boolean).join(" "),
    doctor: a.doctor.name,
    status: a.status,
    hasConsultation: Boolean(a.consultation),
    diagnosis: a.consultation ? [a.consultation.icd10Code, a.consultation.icd10Name].filter(Boolean).join(" · ") : "",
    medications: a.consultation ? a.consultation.prescriptions.length : 0,
    labs: a._count.labOrders
  }));
  await req.audit("view_treatment_summary", "clinic", null, { days });
  res.json({
    days, truncated: appointments.length === 500,
    totals: {
      appointments: rows.length,
      completed: rows.filter(r => r.status === "completed").length,
      pending: rows.filter(r => ["pending", "confirmed"].includes(r.status)).length,
      documented: rows.filter(r => r.hasConsultation).length
    }, rows
  });
}

module.exports = { listTreatment };
