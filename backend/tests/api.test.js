/**
 * Integration tests against a REAL MySQL database — these are not mocks.
 * They were authored but could not be executed inside the sandboxed
 * environment this project was built in (no outbound access to a MySQL
 * server or to the npm registry to install dependencies — see README.md).
 *
 * Before running:
 *   1. Point DATABASE_URL (in your real .env, or export it inline) at a
 *      disposable test database — these tests create and cancel real rows.
 *   2. npx prisma migrate deploy
 *   3. SEED_DEMO_ACCOUNTS=true node prisma/seed.js
 *   4. npm test
 */
const assert = require("node:assert/strict");
const { test, before, after } = require("node:test");
const request = require("supertest");

const app = require("../src/app");
const { prisma, disconnectDb } = require("../src/config/db");

let server;
let agent;
let csrfToken;

before(async () => {
  server = app.listen(0);
  agent = request.agent(server);
  const res = await agent.get("/api/auth/csrf");
  csrfToken = res.body.csrfToken;
});

after(async () => {
  await disconnectDb();
  server.close();
});

test("GET /api/health responds ok", async () => {
  const res = await agent.get("/api/health");
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
});

test("GET /api/doctors and /api/departments are public and non-empty after seeding", async () => {
  const doctors = await agent.get("/api/doctors");
  assert.equal(doctors.status, 200);
  assert.ok(Array.isArray(doctors.body.doctors) && doctors.body.doctors.length > 0);

  const departments = await agent.get("/api/departments");
  assert.equal(departments.status, 200);
  assert.ok(Array.isArray(departments.body.departments) && departments.body.departments.length > 0);
});

test("unauthenticated access to a protected route is rejected", async () => {
  const res = await agent.get("/api/appointments/me");
  assert.equal(res.status, 401);
});

test("a patient can register, then book, then double-book is rejected", async () => {
  const phone = `+996700${Date.now().toString().slice(-6)}`;
  const register = await agent
    .post("/api/auth/register")
    .set("X-CSRF-Token", csrfToken)
    .send({ firstName: "Test", lastName: "Patient", phone, password: "StrongPass123!", consent: true });
  assert.equal(register.status, 201, JSON.stringify(register.body));

  const doctors = await agent.get("/api/doctors");
  const doctorId = doctors.body.doctors[0].id;
  const slots = await agent.get(`/api/doctors/${doctorId}/available-slots`);
  assert.ok(slots.body.slots.length > 0, "expected at least one open slot after seeding a schedule template");
  const slotId = slots.body.slots[0].id;

  const booked = await agent
    .post("/api/appointments")
    .set("X-CSRF-Token", csrfToken)
    .send({ slotId, reason: "Test visit" });
  assert.equal(booked.status, 201, JSON.stringify(booked.body));

  // A second attempt to book the SAME slot (e.g. a racing browser tab) must fail.
  const secondAttempt = await agent
    .post("/api/appointments")
    .set("X-CSRF-Token", csrfToken)
    .send({ slotId, reason: "Should fail — slot already booked" });
  assert.equal(secondAttempt.status, 409, JSON.stringify(secondAttempt.body));

  // Clean up so re-running the suite doesn't accumulate test data.
  const patientId = BigInt(register.body.user.patient.id);
  await prisma.appointment.delete({ where: { id: BigInt(booked.body.appointment.id) } });
  await prisma.appointmentSlot.update({ where: { id: BigInt(slotId) }, data: { status: "open" } });
  await prisma.patient.delete({ where: { id: patientId } }).catch(() => {});
});

test("a plain patient cannot reach admin-only endpoints", async () => {
  const res = await agent.get("/api/admin/stats");
  assert.equal(res.status, 403);
});
