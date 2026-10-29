const { z } = require("zod");
const { prisma } = require("../config/db");
const { ApiError } = require("../middleware/errorHandler");

function requirePatientId(req) {
  if (req.user.role !== "patient" || !req.user.patientId) {
    throw new ApiError(403, "Patients only");
  }
  return BigInt(req.user.patientId);
}

async function getProfile(req, res) {
  const id = requirePatientId(req);
  const patient = await prisma.patient.findUnique({ where: { id } });
  if (!patient) throw new ApiError(404, "Profile not found");
  res.json({ patient: shapePatient(patient) });
}

const updateSchema = z.object({
  firstName: z.string().trim().min(1).max(120).optional(),
  lastName: z.string().trim().max(120).optional(),
  email: z.string().trim().email().max(190).optional().or(z.literal("")),
  dob: z.string().optional() // "YYYY-MM-DD"
});

async function updateProfile(req, res) {
  const id = requirePatientId(req);
  const input = updateSchema.parse(req.body);
  const patient = await prisma.patient.update({
    where: { id },
    data: {
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email === "" ? null : input.email,
      dob: input.dob ? new Date(input.dob) : undefined
    }
  });
  await req.audit("update_profile", "patient", id);
  res.json({ patient: shapePatient(patient) });
}

// A patient may view only their own record, scoped straight from the session —
// never from a client-supplied patient id (that's the whole point of the RBAC
// blueprint's "requireOwnPatient" check, applied here to the patient side too).
async function myMedicalRecord(req, res) {
  const id = requirePatientId(req);
  const record = await prisma.medicalRecord.findUnique({ where: { patientId: id } });
  await req.audit("view_own_medical_record", "patient", id);
  res.json({ medicalRecord: record ? shapeRecord(record) : null });
}

async function myConsultations(req, res) {
  const id = requirePatientId(req);
  const consultations = await prisma.consultation.findMany({
    where: { patientId: id, appointment: { status: "completed" } },
    include: {
      doctor: { select: { id: true, name: true, title: true } },
      prescriptions: { orderBy: { position: "asc" } },
      appointment: {
        select: { scheduledAt: true,
          labOrders: { select: { test: true, status: true } }
        }
      }
    },
    orderBy: { createdAt: "desc" }, take: 100
  });
  await req.audit("view_own_consultations", "patient", id);
  res.json({
    consultations: consultations.map((c) => ({
      id: c.id.toString(),
      anamnesis: c.anamnesis,
      icd10Code: c.icd10Code,
      icd10Name: c.icd10Name,
      treatmentNote: c.treatmentNote,
      createdAt: c.createdAt.toISOString(),
      scheduledAt: c.appointment.scheduledAt.toISOString(),
      doctor: c.doctor,
      prescriptions: c.prescriptions.map(p => ({
        id: p.id.toString(), name: p.name, dosage: p.dosage,
        frequency: p.frequency, duration: p.duration,
        instructions: p.instructions
      })),
      labOrders: c.appointment.labOrders.map(l => ({ test: l.test, status: l.status }))
    }))
  });
}

function shapePatient(p) {
  return {
    id: p.id.toString(),
    firstName: p.firstName,
    lastName: p.lastName,
    phone: p.phone,
    email: p.email,
    dob: p.dob ? p.dob.toISOString().slice(0, 10) : null
  };
}

function shapeRecord(r) {
  return {
    bloodType: r.bloodType,
    allergies: r.allergies,
    chronicConditions: r.chronicConditions,
    updatedAt: r.updatedAt.toISOString()
  };
}

module.exports = { getProfile, updateProfile, myMedicalRecord, myConsultations };
