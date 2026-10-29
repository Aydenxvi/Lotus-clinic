/**
 * Repeatable seed: imports departments + doctors straight from the existing
 * frontend's js/data.js (window.LOTUS.departments / window.LOTUS.doctors),
 * so the real doctor identities, department relationships, prices and bios
 * your clinic already has keep coming from one source of truth. Safe to run
 * more than once — every write is an upsert keyed on the original ids
 * ("d5", "peds", ...), so re-running after editing data.js updates existing
 * rows instead of duplicating them.
 *
 * Usage:  node prisma/seed.js   (or: npm run seed)
 * Override the source file with:  DATA_JS_PATH=/path/to/data.js node prisma/seed.js
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { PrismaClient } = require("@prisma/client");
const { hashPassword } = require("../src/services/password.service");

const prisma = new PrismaClient();

const DATA_JS_PATH =
  process.env.DATA_JS_PATH || path.join(__dirname, "..", "..", "lotus", "js", "data.js");

// Demo staff logins used to live as plaintext `login`/`pass`/`role` fields
// directly inside the public lotus/js/data.js, which shipped real backend
// passwords to every visitor's browser. They now live only here, in a file
// that is never served to the frontend. See seed-credentials.json's own
// comment for how to retire it once you've set real passwords.
const SEED_CREDENTIALS_PATH =
  process.env.SEED_CREDENTIALS_PATH || path.join(__dirname, "seed-credentials.json");

function loadSeedCredentials() {
  try {
    const raw = JSON.parse(fs.readFileSync(SEED_CREDENTIALS_PATH, "utf8"));
    return raw.accounts || {};
  } catch (e) {
    console.warn(`No seed credentials file found at ${SEED_CREDENTIALS_PATH} — doctors will be seeded without staff logins.`);
    return {};
  }
}

function loadLotusData(filePath) {
  const source = fs.readFileSync(filePath, "utf8");
  // data.js only ever does `window.LOTUS = {...}` — no DOM access — so a bare
  // vm sandbox with a `window` stand-in is enough to evaluate it safely and
  // read back the object, without needing a real browser or jsdom.
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: filePath });
  if (!sandbox.window.LOTUS) {
    throw new Error(`Could not find window.LOTUS after evaluating ${filePath}`);
  }
  return sandbox.window.LOTUS;
}

// "900 сом" -> 900.00 ; "от 3 500 сом" / "по программе" -> null (not a fixed amount)
function parsePriceAmount(label) {
  if (!label) return null;
  if (/^от\b|по программе|по назначению/i.test(label)) return null;
  const digits = label.replace(/[^\d]/g, "");
  return digits ? Number(digits) : null;
}

async function upsertDepartments(departments) {
  for (const d of departments) {
    await prisma.department.upsert({
      where: { id: d.id },
      create: {
        id: d.id,
        name: d.name,
        tag: d.tag,
        icon: d.icon,
        wait: d.wait,
        hours: d.hours,
        desc: d.desc,
        servicesTags: d.services || [],
        symptoms: d.symptoms || [],
        equipment: d.equipment,
        checkups: d.checkups || []
      },
      update: {
        name: d.name,
        tag: d.tag,
        icon: d.icon,
        wait: d.wait,
        hours: d.hours,
        desc: d.desc,
        servicesTags: d.services || [],
        symptoms: d.symptoms || [],
        equipment: d.equipment,
        checkups: d.checkups || []
      }
    });

    for (const price of d.prices || []) {
      const existing = await prisma.service.findFirst({ where: { departmentId: d.id, name: price.name } });
      const data = {
        departmentId: d.id,
        name: price.name,
        priceLabel: price.price,
        priceAmount: parsePriceAmount(price.price)
      };
      if (existing) await prisma.service.update({ where: { id: existing.id }, data });
      else await prisma.service.create({ data });
    }
  }
  console.log(`Upserted ${departments.length} departments (+ their service price lists).`);
}

// Default weekly template applied when a doctor's old `slots` array (daily
// recurring times, e.g. ["09:00","11:30","16:00"]) doesn't map to anything
// more specific yet. Mon-Sat bookable, Sunday closed — matches the clinic's
// published hours in js/data.js (brand.hoursWeekday / hoursWeekend).
function weekdaysMonToSat() {
  return [1, 2, 3, 4, 5, 6];
}

async function upsertDoctors(doctors) {
  const credentials = loadSeedCredentials();
  let createdLogins = 0;
  for (const d of doctors) {
    let userId = null;
    const cred = credentials[d.id];
    if (cred && cred.login && cred.pass) {
      const user = await prisma.user.upsert({
        where: { username: cred.login },
        create: { username: cred.login, passwordHash: await hashPassword(cred.pass), role: cred.role === "chief" ? "chief" : "doctor" },
        // Never overwrite an existing password/role on re-seed — an admin may
        // have already changed them through the real app.
        update: {}
      });
      userId = user.id;
      createdLogins++;
    }

    const doctor = await prisma.doctor.upsert({
      where: { id: d.id },
      create: {
        id: d.id,
        userId,
        departmentId: d.dept,
        name: d.name,
        title: d.title,
        exp: d.exp,
        rating: d.rating,
        reviewsCount: d.reviews || 0,
        langs: d.langs || [],
        price: d.price,
        ageGroup: d.ageGroup,
        bio: d.bio,
        initials: d.initials,
        badge: d.badge,
        specialRole: d.specialRole || null,
        specialNote: d.specialNote || null,
        education: d.education || null,
        reviewsList: d.reviewsList || []
      },
      update: {
        departmentId: d.dept,
        name: d.name,
        title: d.title,
        exp: d.exp,
        rating: d.rating,
        reviewsCount: d.reviews || 0,
        langs: d.langs || [],
        price: d.price,
        ageGroup: d.ageGroup,
        bio: d.bio,
        initials: d.initials,
        badge: d.badge,
        specialRole: d.specialRole || null,
        specialNote: d.specialNote || null,
        education: d.education || null,
        reviewsList: d.reviewsList || []
        // userId intentionally left alone on update — linking/unlinking a
        // login is an explicit admin action (POST/PATCH /api/admin/doctors),
        // not something a re-seed should silently change.
      }
    });

    if (Array.isArray(d.slots) && d.slots.length) {
      const existingTemplates = await prisma.doctorScheduleTemplate.count({ where: { doctorId: doctor.id } });
      if (existingTemplates === 0) {
        const rows = [];
        for (const weekday of weekdaysMonToSat()) {
          for (const time of d.slots) {
            rows.push({ doctorId: doctor.id, weekday, startTime: time, slotMinutes: 30, slotsPerDay: 1 });
          }
        }
        await prisma.doctorScheduleTemplate.createMany({ data: rows });
      }
    }
  }
  console.log(`Upserted ${doctors.length} doctors (${createdLogins} with a staff login).`);
}

async function seedDemoPatient() {
  if (!process.env.SEED_DEMO_PASSWORD) {
    console.warn("Demo patient password not configured; skipping demo patient.");
    return;
  }
  if (String(process.env.SEED_DEMO_ACCOUNTS).toLowerCase() !== "true") return;
  const existing = await prisma.user.findUnique({ where: { phone: "+996700000000" } });
  if (existing) return;
  await prisma.user.create({
    data: {
      phone: "+996700000000",
      email: "demo.patient@example.com",
      passwordHash: await hashPassword(process.env.SEED_DEMO_PASSWORD),
      role: "patient",
      patient: {
        create: {
          firstName: "Demo",
          lastName: "Patient",
          phone: "+996700000000",
          email: "demo.patient@example.com",
          consentAt: new Date()
        }
      }
    }
  });
  console.log("Seeded demo patient login: +996700000000 / DemoPatient123! (fictional test account — see README).");
}

async function main() {
  const data = loadLotusData(DATA_JS_PATH);
  await upsertDepartments(data.departments || []);
  await upsertDoctors(data.doctors || []);
  await seedDemoPatient();
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });




