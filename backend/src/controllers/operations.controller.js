// Clinic operations: database-backed rooms and leave approvals.
// Every route using these actions is protected at the router level.
const { z } = require("zod");
const { prisma } = require("../config/db");
const { ApiError } = require("../middleware/errorHandler");

const roomStatusSchema = z.object({ status: z.enum(["Свободен", "Занят"]) }).strict();
const adminRoomSchema = z.object({
  doctorId: z.string().trim().min(1).max(40).nullable().optional(),
  status: z.enum(["Свободен", "Занят"]).optional()
}).strict().refine(v => v.doctorId !== undefined || v.status !== undefined,
  "At least one room field must be supplied");

function shapeRoom(room) {
  return {
    id: room.id,
    room: room.name,
    dept: room.department.name,
    deptId: room.departmentId,
    doctorId: room.doctorId,
    status: room.status
  };
}

const roomInclude = { department: { select: { name: true } } };

async function listAdminRooms(req, res) {
  const rooms = await prisma.room.findMany({ include: roomInclude, orderBy: { name: "asc" } });
  res.json({ rooms: rooms.map(shapeRoom) });
}

async function listMyRooms(req, res) {
  if (!req.user.doctorId) throw new ApiError(403, "Doctor account required");
  const rooms = await prisma.room.findMany({
    where: { doctorId: req.user.doctorId }, include: roomInclude
  });
  res.json({ rooms: rooms.map(shapeRoom) });
}

async function updateAdminRoom(req, res) {
  const input = adminRoomSchema.parse(req.body);
  const id = req.params.id;
  const room = await prisma.$transaction(async tx => {
    const existing = await tx.room.findUnique({ where: { id } });
    if (!existing) throw new ApiError(404, "Room not found");
    if (input.doctorId) {
      const doctor = await tx.doctor.findUnique({ where: { id: input.doctorId } });
      if (!doctor || !doctor.active) throw new ApiError(400, "Unknown or inactive doctor");
      if (doctor.departmentId !== existing.departmentId) {
        throw new ApiError(400, "A doctor can only be assigned to their own department");
      }
      // Transfer the existing assignment before assigning the new room.
      // The UNIQUE constraint also protects against concurrent requests.
      await tx.room.updateMany({ where: { doctorId: doctor.id }, data: { doctorId: null } });
    }
    return tx.room.update({
      where: { id },
      data: {
        ...(input.doctorId !== undefined ? { doctorId: input.doctorId } : {}),
        ...(input.status !== undefined ? { status: input.status } : {})
      }, include: roomInclude
    });
  });
  await req.audit("update_room", "room", id, { doctorId: room.doctorId, status: room.status });
  res.json({ room: shapeRoom(room) });
}

async function updateMyRoomStatus(req, res) {
  if (!req.user.doctorId) throw new ApiError(403, "Doctor account required");
  const input = roomStatusSchema.parse(req.body);
  // Where-clause enforces ownership in the actual database update, not just UI.
  const count = await prisma.room.updateMany({
    where: { doctorId: req.user.doctorId }, data: { status: input.status }
  });
  if (!count.count) throw new ApiError(404, "No room assigned to this doctor");
  const room = await prisma.room.findUnique({
    where: { doctorId: req.user.doctorId }, include: roomInclude
  });
  await req.audit("update_own_room_status", "room", room.id, { status: room.status });
  res.json({ room: shapeRoom(room) });
}

const leaveSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format"),
  reason: z.string().trim().min(5).max(1000)
}).strict();

function shapeLeave(item) {
  return {
    id: item.id.toString(),
    doctorId: item.doctorId,
    doctorName: item.doctor.name,
    date: item.date.toISOString().slice(0, 10),
    reason: item.reason,
    status: item.status,
    created: item.createdAt.toISOString()
  };
}

const leaveInclude = { doctor: { select: { name: true } } };
async function listMyLeaves(req, res) {
  if (!req.user.doctorId) throw new ApiError(403, "Doctor account required");
  const leaves = await prisma.leaveRequest.findMany({
    where: { doctorId: req.user.doctorId }, include: leaveInclude,
    orderBy: { createdAt: "desc" }, take: 100
  });
  res.json({ leaves: leaves.map(shapeLeave) });
}

async function createMyLeave(req, res) {
  if (!req.user.doctorId) throw new ApiError(403, "Doctor account required");
  const input = leaveSchema.parse(req.body);
  const date = new Date(input.date + "T00:00:00.000Z");
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== input.date) {
    throw new ApiError(400, "Invalid date");
  }
  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  if (input.date < yesterday.toISOString().slice(0, 10)) {
    throw new ApiError(400, "Leave date must not be in the past");
  }
  const duplicate = await prisma.leaveRequest.findFirst({
    where: { doctorId: req.user.doctorId, date, status: "pending" }
  });
  if (duplicate) throw new ApiError(409, "An open request already exists for this date");
  const leave = await prisma.leaveRequest.create({
    data: { doctorId: req.user.doctorId, date, reason: input.reason },
    include: leaveInclude
  });
  await req.audit("create_leave_request", "leave_request", leave.id);
  res.status(201).json({ leave: shapeLeave(leave) });
}

async function listAdminLeaves(req, res) {
  const leaves = await prisma.leaveRequest.findMany({
    include: leaveInclude, orderBy: { createdAt: "desc" }, take: 300
  });
  res.json({ leaves: leaves.map(shapeLeave) });
}

const reviewSchema = z.object({ status: z.enum(["approved", "declined"]) }).strict();
async function reviewLeave(req, res) {
  const id = z.coerce.bigint().positive().parse(req.params.id);
  const input = reviewSchema.parse(req.body);
  const result = await prisma.leaveRequest.updateMany({
    where: { id, status: "pending" }, data: { status: input.status }
  });
  if (!result.count) throw new ApiError(409, "Leave request is already reviewed or does not exist");
  const leave = await prisma.leaveRequest.findUnique({ where: { id }, include: leaveInclude });
  await req.audit("review_leave_request", "leave_request", id, { status: input.status });
  res.json({ leave: shapeLeave(leave) });
}

module.exports = {
  listAdminRooms, listMyRooms, updateAdminRoom, updateMyRoomStatus,
  listMyLeaves, createMyLeave, listAdminLeaves, reviewLeave
};
