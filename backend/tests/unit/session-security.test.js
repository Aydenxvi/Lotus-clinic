const assert = require("node:assert/strict");
const { test } = require("node:test");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const { matchesSessionIdentity, sessionUserId } = require("../../src/services/session-identity.service");

const session = { id: "51", role: "doctor", doctorId: "d5", patientId: null };
const activeDoctor = { id: 51n, active: true, role: "doctor", patient: null, doctor: { id: "d5", active: true } };

test("active doctor with matching relation retains access", () => {
  assert.equal(matchesSessionIdentity(session, activeDoctor), true);
});
test("disabled account loses access even with valid previous session", () => {
  assert.equal(matchesSessionIdentity(session, { ...activeDoctor, active: false }), false);
});
test("role demotion invalidates prior chief session", () => {
  assert.equal(matchesSessionIdentity({ ...session, role: "chief" }, activeDoctor), false);
});
test("relinking a doctor invalidates the old session", () => {
  assert.equal(matchesSessionIdentity(session, { ...activeDoctor, doctor: { id: "d6", active: true } }), false);
});
test("deactivating doctor revokes staff access", () => {
  assert.equal(matchesSessionIdentity(session, { ...activeDoctor, doctor: { id: "d5", active: false } }), false);
});
test("patient identity can access only matching patient account", () => {
  const db = { id: 11n, role: "patient", active: true, patient: { id: 3n }, doctor: null };
  assert.equal(matchesSessionIdentity({ id: "11", role: "patient", patientId: "3" }, db), true);
  assert.equal(matchesSessionIdentity({ id: "11", role: "patient", patientId: "4" }, db), false);
});
test("chief without doctor relation is allowed only with no doctor claim", () => {
  const db = { id: 71n, role: "chief", active: true, doctor: null };
  assert.equal(matchesSessionIdentity({ id: "71", role: "chief", doctorId: null }, db), true);
  assert.equal(matchesSessionIdentity({ id: "71", role: "chief", doctorId: "d0" }, db), false);
});
test("malformed session id is safely rejected", () => {
  for (const id of ["xyz", "3x", "", "-4", "5; DROP TABLE users", null]) {
    assert.equal(sessionUserId({ id }), null);
  }
  assert.equal(sessionUserId({ id: "123" }), 123n);
});

test("requireAuth consults the current DB before granting a role", async () => {
  const file = path.resolve(__dirname, "../../src/middleware/auth.js");
  let currentUser = activeDoctor;
  const mod = { exports: {} };
  vm.runInNewContext(fs.readFileSync(file, "utf8"), {
    module: mod,
    require(id) {
      if (id === "../config/db") return { prisma: { user: { findUnique: async () => currentUser } } };
      if (id === "../services/session-identity.service") return { matchesSessionIdentity, sessionUserId };
      throw Error("Unexpected require " + id);
    }
  }, { filename: file });
  let calls = 0, status, body, destroyed = false;
  const req = { session: { user: { ...session }, destroy(cb) { destroyed = true; cb(); } } };
  const res = { status(code) { status = code; return this; }, json(value) { body = value; return this; } };
  await mod.exports.requireAuth(req, res, () => { calls++; });
  assert.equal(calls, 1);
  assert.equal(req.user.doctorId, "d5");
  currentUser = { ...activeDoctor, active: false };
  await mod.exports.requireAuth(req, res, () => { calls++; });
  assert.equal(calls, 1);
  assert.equal(status, 401);
  assert.equal(destroyed, true);
  assert.equal(body.error, "Not authenticated");
});

test("frontend refreshes CSRF after login and logout", async () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../../../lotus/js/api.js"), "utf8");
  const mod = { LOTUS: { apiBase: "https://example.test/api" }, location: { hostname: "example.test" } };
  let count = 0;
  const used = [];
  const fetch = async (url, options = {}) => {
    if (url.endsWith("/auth/csrf")) return { ok: true, json: async () => ({ csrfToken: "csrf-" + (++count) }) };
    if (options.method === "POST") used.push(options.headers["X-CSRF-Token"]);
    if (url.endsWith("/doctors")) return { ok: true, json: async () => ({ doctors: [] }) };
    if (url.endsWith("/departments")) return { ok: true, json: async () => ({ departments: [] }) };
    if (url.endsWith("/auth/me")) return { ok: false, status: 401, json: async () => ({ error: "Unauthorized" }) };
    return { ok: true, json: async () => ({ ok: true }) };
  };
  vm.runInNewContext(source, { window: mod, fetch, console, setTimeout }, { filename: "api.js" });
  await mod.lotusReady;
  await mod.lotusApi("/auth/login", { method: "POST", body: { login: "user", password: "test" } });
  await mod.lotusApi("/appointments", { method: "POST", body: {} });
  await mod.lotusApi("/auth/logout", { method: "POST" });
  await mod.lotusApi("/appointments", { method: "POST", body: {} });
  assert.deepEqual(used, ["csrf-1", "csrf-2", "csrf-2", "csrf-3"]);
  assert.equal(count, 3);
});
