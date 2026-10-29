const { z } = require("zod");
const { prisma } = require("../config/db");
const { ApiError } = require("../middleware/errorHandler");
const booking = require("../services/booking.service");

function requirePatient(req) {
  if (req.user.role !== "patient" || !req.user.patientId) {
    throw new ApiError(403, "Only patients can manage their own appointments here");
  }
  return BigInt(req.user.patientId);
}

function shapeAppointment(a) {
  return {
    id: a.id.toString(),
    status: a.status,
    scheduledAt: a.scheduledAt.toISOString(),
    reason: a.reason,
    createdAt: a.createdAt.toISOString(),
    doctor: a.doctor
      ? { id: a.doctor.id, name: a.doctor.name, title: a.doctor.title, dept: a.doctor.departmentId }
      : undefined,
    patient: a.patient
      ? { id: a.patient.id.toString(), firstName: a.patient.firstName, lastName: a.patient.lastName, phone: a.patient.phone }
      : undefined
  };
}

const createSchema = z.object({
  slotId: z.coerce.bigint(),
  reason: z.string().trim().max(255).optional()
});

async function createAppointment(req, res) {
  const patientId = requirePatient(req);
  const { slotId, reason } = createSchema.parse(req.body);
  const appointment = await booking.bookSlot({ patientId, slotId, reason });
  await req.audit("create_appointment", "appointment", appointment.id, { doctorId: appointment.doctorId });
  res.status(201).json({ appointment: shapeAppointment(appointment) });
}

async function myAppointments(req, res) {
  const patientId = requirePatient(req);
  const appointments = await prisma.appointment.findMany({
    where: { patientId },
    include: { doctor: true },
    orderBy: { scheduledAt: "desc" }
  });
  res.json({ appointments: appointments.map(shapeAppointment) });
}

const patchSchema = z.object({
  action: z.enum(["cancel", "reschedule"]),
  newSlotId: z.coerce.bigint().optional(),
  cancelReason: z.string().trim().max(255).optional()
});

async function patchAppointment(req, res) {
  const patientId = requirePatient(req);
  const id = BigInt(req.params.id);
  const body = patchSchema.parse(req.body);

  let appointment;
  if (body.action === "cancel") {
    appointment = await booking.cancelAppointment({ appointmentId: id, actorPatientId: patientId, cancelReason: body.cancelReason });
    await req.audit("cancel_appointment", "appointment", id);
  } else {
    if (!body.newSlotId) throw new ApiError(400, "newSlotId is required to reschedule");
    appointment = await booking.rescheduleAppointment({ appointmentId: id, newSlotId: body.newSlotId, actorPatientId: patientId });
    await req.audit("reschedule_appointment", "appointment", id, { newSlotId: body.newSlotId.toString() });
  }
  res.json({ appointment: shapeAppointment(appointment) });
}

async function cancelAppointmentDelete(req, res) {
  const patientId = requirePatient(req);
  const id = BigInt(req.params.id);
  const appointment = await booking.cancelAppointment({ appointmentId: id, actorPatientId: patientId });
  await req.audit("cancel_appointment", "appointment", id);
  res.json({ appointment: shapeAppointment(appointment) });
}

module.exports = { createAppointment, myAppointments, patchAppointment, cancelAppointmentDelete, shapeAppointment };
