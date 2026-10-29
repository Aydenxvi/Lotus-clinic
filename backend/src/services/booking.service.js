const { prisma } = require("../config/db");
const { ApiError } = require("../middleware/errorHandler");

/**
 * Books a slot for a patient inside one DB transaction.
 *
 * Double-booking protection has two independent layers:
 *  1. The conditional UPDATE below only succeeds if the slot's status is still
 *     "open" at commit time. InnoDB takes a row lock on the first UPDATE to
 *     reach it; a second concurrent request for the SAME slot blocks on that
 *     lock, then re-reads status as "booked" once the first commits, so its
 *     WHERE clause matches zero rows and Prisma throws P2025 — no appointment
 *     is created for the loser.
 *  2. Belt-and-suspenders: appointment_slots has a UNIQUE (doctorId, slotAt)
 *     index and appointments.slotId is UNIQUE, so even a bug that bypassed
 *     layer 1 could not produce two appointments on the same slot — MySQL
 *     itself would reject the second INSERT.
 */
async function bookSlot({ patientId, slotId, reason }) {
  return prisma.$transaction(async (tx) => {
    const slot = await tx.appointmentSlot.findUnique({ where: { id: slotId } });
    if (!slot) throw new ApiError(404, "That slot no longer exists");
    if (slot.slotAt.getTime() < Date.now()) throw new ApiError(400, "That slot is in the past");

    let updated;
    try {
      updated = await tx.appointmentSlot.update({
        where: { id: slotId, status: "open" }, // conditional update = the actual lock
        data: { status: "booked" }
      });
    } catch (e) {
      if (e.code === "P2025") {
        throw new ApiError(409, "This slot was just taken by someone else. Please pick another time.");
      }
      throw e;
    }

    const appointment = await tx.appointment.create({
      data: {
        patientId,
        doctorId: updated.doctorId,
        slotId: updated.id,
        scheduledAt: updated.slotAt,
        status: "pending",
        reason: reason || null
      },
      include: { doctor: true, slot: true }
    });
    return appointment;
  });
}

async function cancelAppointment({ appointmentId, actorPatientId, cancelReason }) {
  return prisma.$transaction(async (tx) => {
    const appt = await tx.appointment.findUnique({ where: { id: appointmentId } });
    if (!appt) throw new ApiError(404, "Appointment not found");
    if (actorPatientId && appt.patientId !== actorPatientId) {
      throw new ApiError(403, "This is not your appointment");
    }
    if (appt.status === "cancelled") return appt;
    if (appt.status === "completed") throw new ApiError(400, "A completed appointment cannot be cancelled");

    await tx.appointmentSlot.update({ where: { id: appt.slotId }, data: { status: "open" } });
    return tx.appointment.update({
      where: { id: appointmentId },
      data: { status: "cancelled", cancelledAt: new Date(), cancelReason: cancelReason || null }
    });
  });
}

async function rescheduleAppointment({ appointmentId, newSlotId, actorPatientId }) {
  return prisma.$transaction(async (tx) => {
    const appt = await tx.appointment.findUnique({ where: { id: appointmentId } });
    if (!appt) throw new ApiError(404, "Appointment not found");
    if (actorPatientId && appt.patientId !== actorPatientId) {
      throw new ApiError(403, "This is not your appointment");
    }
    if (appt.status === "cancelled" || appt.status === "completed") {
      throw new ApiError(400, `A ${appt.status} appointment cannot be rescheduled`);
    }

    const newSlot = await tx.appointmentSlot.findUnique({ where: { id: newSlotId } });
    if (!newSlot) throw new ApiError(404, "That slot no longer exists");
    if (newSlot.doctorId !== appt.doctorId) throw new ApiError(400, "That slot belongs to a different doctor");

    let claimedSlot;
    try {
      claimedSlot = await tx.appointmentSlot.update({
        where: { id: newSlotId, status: "open" },
        data: { status: "booked" }
      });
    } catch (e) {
      if (e.code === "P2025") {
        throw new ApiError(409, "That slot was just taken by someone else. Please pick another time.");
      }
      throw e;
    }

    await tx.appointmentSlot.update({ where: { id: appt.slotId }, data: { status: "open" } });

    return tx.appointment.update({
      where: { id: appointmentId },
      data: { slotId: claimedSlot.id, scheduledAt: claimedSlot.slotAt, status: "pending" }
    });
  });
}

async function setAppointmentStatus({ appointmentId, status, doctorId }) {
  return prisma.$transaction(async (tx) => {
    const appt = await tx.appointment.findUnique({ where: { id: appointmentId } });
    if (!appt) throw new ApiError(404, "Appointment not found");
    if (doctorId && appt.doctorId !== doctorId) {
      throw new ApiError(403, "This appointment is not on your schedule");
    }
    if (status === "cancelled") {
      await tx.appointmentSlot.update({ where: { id: appt.slotId }, data: { status: "open" } });
    }
    return tx.appointment.update({ where: { id: appointmentId }, data: { status } });
  });
}

module.exports = { bookSlot, cancelAppointment, rescheduleAppointment, setAppointmentStatus };
