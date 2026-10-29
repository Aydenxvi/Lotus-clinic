const { z } = require("zod");
const { prisma } = require("../config/db");
const { ApiError } = require("../middleware/errorHandler");
const booking = require("../services/booking.service");

// The chief ("Главный врач") is also a practicing doctor in the data model
// (e.g. d0), so they carry a doctorId too and can use these doctor-scoped
// routes for their own schedule — on top of the clinic-wide /api/admin/* ones.
function requireDoctorId(req) {
  if (!["doctor", "chief"].includes(req.user.role) || !req.user.doctorId) {
    throw new ApiError(403, "Doctor account required");
  }
  return req.user.doctorId;
}

async function mySchedule(req, res) {
  const doctorId = requireDoctorId(req);
  const days = Math.min(Number(req.query.days) || 14, 60);
  // Optional explicit window start (ISO date/time) so a caller can ask for
  // "today" (midnight to midnight) instead of only "from this instant
  // forward" — the cabinet's day view needs this morning's completed
  // appointments too, not just upcoming ones.
  const from = req.query.from ? new Date(String(req.query.from)) : new Date();
  const to = new Date(from.getTime() + days * 24 * 60 * 60 * 1000);

  const appointments = await prisma.appointment.findMany({
    where: { doctorId, scheduledAt: { gte: from, lte: to }, status: { not: "cancelled" } },
    include: { patient: true },
    orderBy: { scheduledAt: "asc" }
  });

  res.json({
    appointments: appointments.map((a) => ({
      id: a.id.toString(),
      status: a.status,
      scheduledAt: a.scheduledAt.toISOString(),
      reason: a.reason,
      patient: { id: a.patient.id.toString(), firstName: a.patient.firstName, lastName: a.patient.lastName, phone: a.patient.phone }
    }))
  });
}

// "View patients under their care" — scoped to patients who actually have (or
// had) an appointment with this doctor, not the whole clinic's patient list.
async function myPatients(req, res) {
  const doctorId = requireDoctorId(req);
  const appointments = await prisma.appointment.findMany({
    where: { doctorId },
    include: { patient: true },
    distinct: ["patientId"],
    orderBy: { scheduledAt: "desc" }
  });
  res.json({
    patients: appointments.map((a) => ({
      id: a.patient.id.toString(),
      firstName: a.patient.firstName,
      lastName: a.patient.lastName,
      phone: a.patient.phone
    }))
  });
}

// Scoped chart read: confirms this doctor actually has an appointment with the
// requested patient before returning anything — mirrors requireOwnPatient from
// the RBAC blueprint, re-implemented against sessions instead of a JWT claim.
async function getPatientChart(req, res) {
  const doctorId = requireDoctorId(req);
  const patientId = BigInt(req.params.patientId);
  const hasRelationship = await prisma.appointment.findFirst({ where: { doctorId, patientId } });
  if (!hasRelationship) throw new ApiError(403, "This patient is not under your care");

  const [patient, record, consultations] = await Promise.all([
    prisma.patient.findUnique({ where: { id: patientId } }),
    prisma.medicalRecord.findUnique({ where: { patientId } }),
    prisma.consultation.findMany({ where: { patientId, doctorId }, orderBy: { createdAt: "desc" } })
  ]);
  if (!patient) throw new ApiError(404, "Patient not found");

  await req.audit("view_patient_chart", "patient", patientId);
  res.json({
    patient: { id: patient.id.toString(), firstName: patient.firstName, lastName: patient.lastName, phone: patient.phone, dob: patient.dob },
    medicalRecord: record ? { bloodType: record.bloodType, allergies: record.allergies, chronicConditions: record.chronicConditions } : null,
    consultations: consultations.map((c) => ({
      id: c.id.toString(),
      anamnesis: c.anamnesis,
      icd10Code: c.icd10Code,
      icd10Name: c.icd10Name,
      treatmentNote: c.treatmentNote,
      createdAt: c.createdAt.toISOString()
    }))
  });
}

const consultationSchema = z.object({
  appointmentId: z.coerce.bigint(),
  anamnesis: z.string().trim().max(5000).optional(),
  icd10Code: z.string().trim().max(10).optional(),
  icd10Name: z.string().trim().max(255).optional(),
  treatmentNote: z.string().trim().max(5000).optional(),
  markCompleted: z.boolean().optional().default(true)
});

async function createConsultation(req, res) {
  const doctorId = requireDoctorId(req);
  const input = consultationSchema.parse(req.body);

  const appointment = await prisma.appointment.findUnique({ where: { id: input.appointmentId } });
  if (!appointment) throw new ApiError(404, "Appointment not found");
  if (appointment.doctorId !== doctorId) throw new ApiError(403, "This appointment is not on your schedule");

  const consultation = await prisma.$transaction(async (tx) => {
    const created = await tx.consultation.upsert({
      where: { appointmentId: input.appointmentId },
      create: {
        appointmentId: input.appointmentId,
        doctorId,
        patientId: appointment.patientId,
        anamnesis: input.anamnesis,
        icd10Code: input.icd10Code,
        icd10Name: input.icd10Name,
        treatmentNote: input.treatmentNote
      },
      update: {
        anamnesis: input.anamnesis,
        icd10Code: input.icd10Code,
        icd10Name: input.icd10Name,
        treatmentNote: input.treatmentNote
      }
    });
    if (input.markCompleted) {
      await tx.appointment.update({ where: { id: input.appointmentId }, data: { status: "completed" } });
    }
    return created;
  });

  await req.audit("create_consultation", "consultation", consultation.id, { appointmentId: input.appointmentId.toString() });
  res.status(201).json({ consultation: { ...consultation, id: consultation.id.toString() } });
}

const statusSchema = z.object({ status: z.enum(["pending", "confirmed", "completed", "cancelled", "no_show"]) });

async function updateAppointmentStatus(req, res) {
  const doctorId = requireDoctorId(req);
  const { status } = statusSchema.parse(req.body);
  const appointment = await booking.setAppointmentStatus({ appointmentId: BigInt(req.params.id), status, doctorId });
  await req.audit("update_appointment_status", "appointment", appointment.id, { status });
  res.json({ appointment: { ...appointment, id: appointment.id.toString() } });
}

const availabilitySchema = z.object({
  type: z.enum(["day_off", "extra_slot"]),
  date: z.string(), // "YYYY-MM-DD"
  startTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  reason: z.string().trim().max(255).optional()
});

async function addAvailabilityOverride(req, res) {
  const doctorId = requireDoctorId(req);
  const input = availabilitySchema.parse(req.body);
  if (input.type === "extra_slot" && !input.startTime) {
    throw new ApiError(400, "startTime is required for an extra_slot override");
  }
  const override = await prisma.doctorAvailabilityOverride.create({
    data: { doctorId, date: new Date(input.date), type: input.type, startTime: input.startTime, reason: input.reason }
  });
  await req.audit("add_availability_override", "doctor", doctorId, { type: input.type, date: input.date });
  res.status(201).json({ override: { ...override, id: override.id.toString() } });
}

async function removeAvailabilityOverride(req, res) {
  const doctorId = requireDoctorId(req);
  const id = BigInt(req.params.id);
  const existing = await prisma.doctorAvailabilityOverride.findUnique({ where: { id } });
  if (!existing || existing.doctorId !== doctorId) throw new ApiError(404, "Override not found");
  await prisma.doctorAvailabilityOverride.delete({ where: { id } });
  await req.audit("remove_availability_override", "doctor", doctorId, { id: id.toString() });
  res.json({ ok: true });
}

module.exports = {
  mySchedule,
  myPatients,
  getPatientChart,
  createConsultation,
  updateAppointmentStatus,
  addAvailabilityOverride,
  removeAvailabilityOverride
};
