# LOTUS CLINIC — Portfolio release notes

**Public site:** https://lotus-clinic-web.onrender.com  
**Public API health:** https://lotus-clinic-api.onrender.com/api/health  
**Source:** https://github.com/Aydenxvi/Lotus-clinic

## Project scope

Full-stack clinic scheduling and workflow demonstration built using HTML/CSS/vanilla JavaScript, Express, Prisma and MySQL.

- Patients: registration, appointments, cancellation and access to their own completed consultations.
- Doctors: schedules, patient charts, visit notes, diagnosis, prescriptions, laboratory referrals and consultation history.
- Chief doctor: staff, scheduling, rooms, leave requests, laboratory/pharmacy inventory and reporting.
- API: role-based access; Argon2 password hashing; session cookies; CSRF protection; database-backed persistence.

**Do not claim:** actual clinical production readiness, real EHR interoperability, medical regulatory compliance, audited accessibility, or a completed penetration test.

## How to demonstrate to an employer

1. Open the public homepage; browse doctors and departments without logging in.
2. Explain the patient→appointment→doctor→completed visit flow with fictional demo data.
3. Show database entities and versioned Prisma migrations (`backend/prisma/migrations`).
4. Show authorization middleware, negative authorization tests and CI in `.github/workflows`.
5. Show anonymous smoke check and its GitHub Actions manual workflow.
6. Discuss tradeoffs: vanilla JS, session-based auth, free hosting cold starts, no real patient data.

## Release quality gate

- Run `node --test backend/tests/unit/public-smoke.test.js` locally.
- Wait for both Render services to reach `Live` for the commit.
- Run `node backend/scripts/public-smoke.js` to check the deployed public endpoints without writes.
- Test one normal full booking flow with fictional data only.

## Safety

Passwords, Aiven connection URLs, and Render environment variables must never appear in a public repo or the portfolio screenshots. The demo is **not suitable for real patient information**. The automated smoke script only performs GET requests and uses no account credentials.
