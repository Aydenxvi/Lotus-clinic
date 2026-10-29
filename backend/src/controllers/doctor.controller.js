const { z } = require("zod");
const { prisma } = require("../config/db");
const { ApiError } = require("../middleware/errorHandler");
const booking = require("../services/booking.service");
const { LAB_TESTS } = require("./clinical-operations.controller");

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
// Never trust a patient/appointment id from the client without resolving it
// against the doctor id in the authenticated server session.
function parseId(raw) {
  if (!/^\d+$/.test(String(raw))) throw new ApiError(400, "Invalid numeric id");
  return BigInt(raw);
}
async function assertOwnPatient(doctorId, patientId) {
  const related = await prisma.appointment.findFirst({
    where: { doctorId, patientId }, select: { id: true }
  });
  if (!related) throw new ApiError(403, "This patient is not under your care");
}
function shapeRx(rx) {
  return {
    id: rx.id.toString(), name: rx.name, dosage: rx.dosage,
    frequency: rx.frequency, duration: rx.duration,
    instructions: rx.instructions
  };
}
function shapeConsultation(c) {
  return {
    id: c.id.toString(), appointmentId: c.appointmentId.toString(),
    anamnesis: c.anamnesis, icd10Code: c.icd10Code,
    icd10Name: c.icd10Name, treatmentNote: c.treatmentNote,
    createdAt: c.createdAt.toISOString(), updatedAt: c.updatedAt.toISOString(),
    prescriptions: (c.prescriptions || []).map(shapeRx)
  };
}
async function getPatientChart(req, res) {
  const doctorId = requireDoctorId(req);
  const patientId = parseId(req.params.patientId);
  await assertOwnPatient(doctorId, patientId);

  const [patient, record, consultations, labs] = await Promise.all([
    prisma.patient.findUnique({ where: { id: patientId } }),
    prisma.medicalRecord.findUnique({ where: { patientId } }),
    prisma.consultation.findMany({
      where: { patientId, doctorId }, include: {
        prescriptions: { orderBy: { position: "asc" } },
        appointment: { select: { scheduledAt: true, status: true } }
      }, orderBy: { createdAt: "desc" }, take: 100
    }),
    prisma.labOrder.findMany({
      where: { patientId, doctorId },
      select: { appointmentId: true, test: true, status: true },
      orderBy: { createdAt: "desc" }, take: 300
    })
  ]);
  if (!patient) throw new ApiError(404, "Patient not found");
  const labsByAppointment = new Map();
  for (const lab of labs) {
    const key = lab.appointmentId.toString();
    if (!labsByAppointment.has(key)) labsByAppointment.set(key, []);
    labsByAppointment.get(key).push({ test: lab.test, status: lab.status });
  }
  await req.audit("view_patient_chart", "patient", patientId);
  res.json({
    patient: {
      id: patient.id.toString(), firstName: patient.firstName,
      lastName: patient.lastName, phone: patient.phone,
      dob: patient.dob ? patient.dob.toISOString().slice(0, 10) : null
    },
    medicalRecord: record ? {
      bloodType: record.bloodType, allergies: record.allergies,
      chronicConditions: record.chronicConditions,
      updatedAt: record.updatedAt.toISOString()
    } : null,
    consultations: consultations.map((c) => ({
      ...shapeConsultation(c),
      scheduledAt: c.appointment.scheduledAt.toISOString(),
      appointmentStatus: c.appointment.status,
      labOrders: labsByAppointment.get(c.appointmentId.toString()) || []
    }))
  });
}

const medicalRecordSchema = z.object({
  bloodType: z.string().trim().max(10).nullable().optional(),
  allergies: z.string().trim().max(2000).nullable().optional(),
  chronicConditions: z.string().trim().max(2000).nullable().optional()
}).strict().refine(v => Object.keys(v).length > 0, "No fields to update");

async function updatePatientMedicalRecord(req, res) {
  const doctorId = requireDoctorId(req);
  const patientId = parseId(req.params.patientId);
  await assertOwnPatient(doctorId, patientId);
  const input = medicalRecordSchema.parse(req.body);
  const record = await prisma.medicalRecord.upsert({
    where: { patientId },
    create: { patientId, ...input, updatedByUserId: BigInt(req.user.id) },
    update: { ...input, updatedByUserId: BigInt(req.user.id) }
  });
  await req.audit("update_patient_medical_record", "patient", patientId, {
    fields: Object.keys(input) // Never put actual medical contents in audit metadata.
  });
  res.json({ medicalRecord: {
    bloodType: record.bloodType, allergies: record.allergies,
    chronicConditions: record.chronicConditions,
    updatedAt: record.updatedAt.toISOString()
  } });
}

async function getAppointmentConsultation(req, res) {
  const doctorId = requireDoctorId(req);
  const appointmentId = parseId(req.params.id);
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId }, select: { doctorId: true, status: true }
  });
  if (!appointment || appointment.doctorId !== doctorId) {
    throw new ApiError(404, "Appointment not found on your schedule");
  }
  const [consultation, labs] = await Promise.all([
    prisma.consultation.findUnique({
      where: { appointmentId },
      include: { prescriptions: { orderBy: { position: "asc" } } }
    }),
    prisma.labOrder.findMany({ where: { appointmentId }, select: { test: true, status: true } })
  ]);
  res.json({
    status: appointment.status,
    consultation: consultation ? shapeConsultation(consultation) : null,
    labOrders: labs
  });
}

const prescriptionSchema = z.object({
  name: z.string().trim().min(2).max(190),
  dosage: z.string().trim().min(1).max(120),
  frequency: z.string().trim().max(120).optional().default(""),
  duration: z.string().trim().max(120).optional().default(""),
  instructions: z.string().trim().max(500).optional().default("")
}).strict();
const consultationSchema = z.object({
  appointmentId: z.coerce.bigint().positive(),
  anamnesis: z.string().trim().max(5000).optional(),
  icd10Code: z.string().trim().max(10).optional(),
  icd10Name: z.string().trim().max(255).optional(),
  treatmentNote: z.string().trim().max(5000).optional(),
  labTests: z.array(z.enum(LAB_TESTS)).max(8).optional().default([]),
  prescriptions: z.array(prescriptionSchema).max(12).optional().default([]),
  markCompleted: z.boolean().optional().default(true)
}).strict();

async function createConsultation(req, res) {
  const doctorId = requireDoctorId(req);
  const input = consultationSchema.parse(req.body);
  const appointment = await prisma.appointment.findUnique({
    where: { id: input.appointmentId }, select: { id: true, doctorId: true, patientId: true }
  });
  if (!appointment) throw new ApiError(404, "Appointment not found");
  if (appointment.doctorId !== doctorId) throw new ApiError(403, "Appointment not on your schedule");

  // Only one authoritative consultation per appointment. A completed encounter
  // is immutable through this API: avoids overwriting documented care by accident.
  const consultation = await prisma.$transaction(async (tx) => {
    const current = await tx.appointment.findUnique({
      where: { id: input.appointmentId }, select: { status: true }
    });
    if (!current || !["pending", "confirmed"].includes(current.status)) {
      throw new ApiError(409, "Only pending or confirmed appointments can be edited");
    }
    if (input.markCompleted) {
      const lock = await tx.appointment.updateMany({
        where: { id: input.appointmentId, doctorId, status: { in: ["pending", "confirmed"] } },
        data: { status: "completed" }
      });
      if (lock.count !== 1) throw new ApiError(409, "Appointment already completed or changed");
    }
    const created = await tx.consultation.upsert({
      where: { appointmentId: input.appointmentId },
      create: {
        appointmentId: input.appointmentId, doctorId,
        patientId: appointment.patientId,
        anamnesis: input.anamnesis || null,
        icd10Code: input.icd10Code || null,
        icd10Name: input.icd10Name || null,
        treatmentNote: input.treatmentNote || null
      },
      update: {
        anamnesis: input.anamnesis || null,
        icd10Code: input.icd10Code || null,
        icd10Name: input.icd10Name || null,
        treatmentNote: input.treatmentNote || null
      }
    });
    await tx.prescription.deleteMany({ where: { consultationId: created.id } });
    if (input.prescriptions.length) {
      await tx.prescription.createMany({
        data: input.prescriptions.map((p, position) => ({
          consultationId: created.id, position,
          name: p.name, dosage: p.dosage,
          frequency: p.frequency || null, duration: p.duration || null,
          instructions: p.instructions || null
        }))
      });
    }
    // Draft edits may remove referrals that have not entered processing.
    // In-progress/completed lab work is never deleted from this workflow.
    await tx.labOrder.deleteMany({
      where: {
        appointmentId: appointment.id, status: "Назначено",
        test: { notIn: input.labTests }
      }
    });
    if (input.labTests.length) {
      await tx.labOrder.createMany({
        data: [...new Set(input.labTests)].map(test => ({
          appointmentId: appointment.id, doctorId,
          patientId: appointment.patientId, test
        })), skipDuplicates: true
      });
    }
    return created;
  });
  await req.audit("save_consultation", "consultation", consultation.id, {
    appointmentId: input.appointmentId.toString(),
    completed: input.markCompleted, medications: input.prescriptions.length,
    labReferrals: input.labTests.length
  });
  res.status(201).json({ consultation: {
    id: consultation.id.toString(), appointmentId: consultation.appointmentId.toString(),
    completed: input.markCompleted
  } });
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
  getAppointmentConsultation,
  updatePatientMedicalRecord,
  createConsultation,
  updateAppointmentStatus,
  addAvailabilityOverride,
  removeAvailabilityOverride
};
