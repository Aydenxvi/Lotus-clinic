const { prisma } = require("../config/db");

const DAY_MS = 24 * 60 * 60 * 1000;

function dateOnly(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60000);
}

function timeStrToMinutes(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/**
 * Lazily materializes AppointmentSlot rows for one doctor over [fromDate, toDate]
 * (inclusive, both Date objects at midnight) from their weekly DoctorScheduleTemplate,
 * honoring DoctorAvailabilityOverride ("day_off" removes a whole day, "extra_slot"
 * adds one ad-hoc slot). Safe to call repeatedly — relies on the DB unique
 * constraint (doctorId, slotAt) to no-op on slots that already exist.
 */
async function ensureSlotsGenerated(doctorId, fromDate, toDate) {
  const templates = await prisma.doctorScheduleTemplate.findMany({
    where: { doctorId, active: true }
  });
  const overrides = await prisma.doctorAvailabilityOverride.findMany({
    where: { doctorId, date: { gte: dateOnly(fromDate), lte: dateOnly(toDate) } }
  });
  const dayOffDates = new Set(
    overrides.filter((o) => o.type === "day_off").map((o) => dateOnly(o.date).toISOString())
  );
  const extraSlots = overrides.filter((o) => o.type === "extra_slot");

  const toCreate = [];
  for (let d = dateOnly(fromDate); d <= dateOnly(toDate); d = new Date(d.getTime() + DAY_MS)) {
    const isoDay = d.toISOString();
    if (dayOffDates.has(isoDay)) continue;
    const weekday = d.getDay();
    for (const t of templates.filter((tpl) => tpl.weekday === weekday)) {
      const startMinutes = timeStrToMinutes(t.startTime);
      for (let i = 0; i < t.slotsPerDay; i++) {
        const slotAt = addMinutes(d, startMinutes + i * t.slotMinutes);
        toCreate.push({ doctorId, slotAt });
      }
    }
  }
  for (const o of extraSlots) {
    if (!o.startTime) continue;
    const slotAt = addMinutes(dateOnly(o.date), timeStrToMinutes(o.startTime));
    toCreate.push({ doctorId, slotAt });
  }

  if (toCreate.length) {
    await prisma.appointmentSlot.createMany({ data: toCreate, skipDuplicates: true });
  }
}

/**
 * Returns the doctor's open, future slots in [fromDate, toDate], generating
 * them first if the template hasn't been materialized that far out yet.
 */
async function getAvailableSlots(doctorId, fromDate, toDate) {
  await ensureSlotsGenerated(doctorId, fromDate, toDate);
  const now = new Date();
  return prisma.appointmentSlot.findMany({
    where: {
      doctorId,
      status: "open",
      slotAt: { gte: now > fromDate ? now : fromDate, lte: toDate }
    },
    orderBy: { slotAt: "asc" }
  });
}

module.exports = { ensureSlotsGenerated, getAvailableSlots, dateOnly, addMinutes };
