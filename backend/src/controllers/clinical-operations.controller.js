// Portfolio demo only: laboratory referrals and pharmacy stock in MySQL.
// Every handler is protected at the route layer by authenticated staff roles.
const { randomUUID } = require("node:crypto");
const { z } = require("zod");
const { prisma } = require("../config/db");
const { ApiError } = require("../middleware/errorHandler");

const LAB_TESTS = [
  "Общий анализ крови", "Биохимия (15 показателей)", "ЭКГ с расшифровкой",
  "УЗИ одного органа", "ПЦР-тест", "Онкомаркеры", "МРТ/КТ",
  "Гликированный гемоглобин"
];

function ownDoctor(req) {
  if (!req.user.doctorId) throw new ApiError(403, "Doctor account required");
  return req.user.doctorId;
}

const orderInclude = {
  patient: { select: { firstName: true, lastName: true } },
  doctor: { select: { name: true } }
};
function shapeLab(row) {
  return {
    id: row.id.toString(),
    patient: [row.patient.firstName, row.patient.lastName].filter(Boolean).join(" "),
    test: row.test,
    doctor: row.doctor.name,
    ordered: row.createdAt.toISOString().slice(0, 10),
    status: row.status
  };
}
async function listMyLabs(req, res) {
  const doctorId = ownDoctor(req);
  const rows = await prisma.labOrder.findMany({
    where: { doctorId }, include: orderInclude,
    orderBy: { createdAt: "desc" }, take: 300
  });
  res.json({ orders: rows.map(shapeLab) });
}
async function listAdminLabs(req, res) {
  const rows = await prisma.labOrder.findMany({
    include: orderInclude, orderBy: { createdAt: "desc" }, take: 500
  });
  res.json({ orders: rows.map(shapeLab) });
}
const labStatusSchema = z.object({
  status: z.enum(["В работе", "Готово"])
}).strict();
async function advanceLabStatus(req, res) {
  const id = z.coerce.bigint().positive().parse(req.params.id);
  const { status } = labStatusSchema.parse(req.body);
  const oldStatus = status === "В работе" ? "Назначено" : "В работе";
  const updated = await prisma.labOrder.updateMany({
    where: { id, status: oldStatus }, data: { status }
  });
  if (updated.count !== 1) throw new ApiError(409, "Lab order not found or status has changed");
  const order = await prisma.labOrder.findUnique({ where: { id }, include: orderInclude });
  await req.audit("advance_lab_order", "lab_order", id, { status });
  res.json({ order: shapeLab(order) });
}

const itemFields = z.object({
  name: z.string().trim().min(2).max(190),
  price: z.number().int().min(0).max(10000000),
  qty: z.number().int().min(0).max(10000000),
  expire: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  manufacture: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable()
}).strict().refine(v => !v.expire || !v.manufacture || v.manufacture <= v.expire,
  "Manufacture date must not be after expiration date");
function isoDate(input) {
  if (input === null) return null;
  const date = new Date(input + "T00:00:00.000Z");
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== input) {
    throw new ApiError(400, "Invalid calendar date");
  }
  return date;
}
function shapeItem(item) {
  return {
    id: item.id, name: item.name, price: item.price, qty: item.qty,
    expire: item.expire ? item.expire.toISOString().slice(0, 10) : "",
    manufacture: item.manufacture ? item.manufacture.toISOString().slice(0, 10) : ""
  };
}
function shapeIssue(row) {
  return {
    id: row.id.toString(), drug: row.item.name, qty: row.qty,
    reason: row.reason, doctor: row.doctor.name,
    date: row.createdAt.toISOString()
  };
}
const issueInclude = {
  item: { select: { name: true } },
  doctor: { select: { name: true } }
};
async function readPharmacy(whereIssue) {
  const [items, issues] = await Promise.all([
    prisma.pharmacyItem.findMany({
      where: { active: true }, orderBy: { name: "asc" }, take: 500
    }),
    prisma.pharmacyIssue.findMany({
      where: whereIssue, include: issueInclude,
      orderBy: { createdAt: "desc" }, take: 200
    })
  ]);
  return { items: items.map(shapeItem), issues: issues.map(shapeIssue) };
}
async function getDoctorPharmacy(req, res) {
  const doctorId = ownDoctor(req);
  res.json(await readPharmacy({ doctorId }));
}
async function getAdminPharmacy(req, res) {
  res.json(await readPharmacy({}));
}

async function createItem(req, res) {
  const data = itemFields.parse(req.body);
  const created = await prisma.pharmacyItem.create({
    data: { id: "ph-" + randomUUID(), name: data.name, price: data.price, qty: data.qty,
      expire: isoDate(data.expire), manufacture: isoDate(data.manufacture) }
  });
  await req.audit("create_pharmacy_item", "pharmacy_item", created.id);
  res.status(201).json({ item: shapeItem(created) });
}
async function updateItem(req, res) {
  const data = itemFields.parse(req.body);
  const updated = await prisma.pharmacyItem.update({
    where: { id: req.params.id, active: true },
    data: { name: data.name, price: data.price, qty: data.qty,
      expire: isoDate(data.expire), manufacture: isoDate(data.manufacture) }
  });
  await req.audit("update_pharmacy_item", "pharmacy_item", updated.id);
  res.json({ item: shapeItem(updated) });
}
async function deactivateItem(req, res) {
  const result = await prisma.pharmacyItem.updateMany({
    where: { id: req.params.id, active: true }, data: { active: false }
  });
  if (!result.count) throw new ApiError(404, "Pharmacy item not found");
  await req.audit("deactivate_pharmacy_item", "pharmacy_item", req.params.id);
  res.json({ success: true });
}

const issueSchema = z.object({
  itemId: z.string().min(1).max(40),
  qty: z.number().int().min(1).max(10000),
  reason: z.string().trim().min(3).max(300)
}).strict();
async function issueMedicine(req, res) {
  const doctorId = ownDoctor(req);
  const data = issueSchema.parse(req.body);
  const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z");
  const issue = await prisma.$transaction(async tx => {
    // Atomic conditional decrement: concurrent requests cannot overspend stock.
    // Expired products cannot be dispensed even if their quantity is positive.
    const update = await tx.pharmacyItem.updateMany({
      where: { id: data.itemId, active: true, qty: { gte: data.qty },
        OR: [{ expire: null }, { expire: { gte: today } }] },
      data: { qty: { decrement: data.qty } }
    });
    if (update.count !== 1) throw new ApiError(409, "Insufficient stock, expired or inactive medicine");
    return tx.pharmacyIssue.create({
      data: { itemId: data.itemId, doctorId, qty: data.qty, reason: data.reason },
      include: issueInclude
    });
  });
  await req.audit("issue_pharmacy_item", "pharmacy_issue", issue.id, {
    itemId: data.itemId, qty: data.qty
  });
  res.status(201).json({ issue: shapeIssue(issue) });
}

module.exports = {
  LAB_TESTS, listMyLabs, listAdminLabs, advanceLabStatus,
  getDoctorPharmacy, getAdminPharmacy,
  createItem, updateItem, deactivateItem, issueMedicine
};
