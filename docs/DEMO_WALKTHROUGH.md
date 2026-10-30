# LOTUS CLINIC — Demonstration walkthrough

A short, safe way to present the project to a recruiter or interviewer. **Do not provide public admin credentials** and **never use real patient information**.

## In a 3–5 minute demo

1. **Homepage and responsive UI:** open https://lotus-clinic-web.onrender.com and show the doctor/department directory and one doctor profile. Mention the custom HTML/CSS/vanilla JS frontend and API-fed catalog.
2. **Booking architecture:** show appointment selection and available slots. Explain how the Express API and MySQL/Prisma handle reservation and duplicate-booking conflicts. Use a fictional account **only if you need to submit a booking**.
3. **Clinician view:** with your private demo credentials and a fictional record, show the schedule, consultation fields, prescriptions and laboratory referrals. Never screen-share passwords.
4. **Administration:** demonstrate room assignment, leave approvals and inventory, or show screenshots if credentials should remain private.
5. **Engineering proof:** show `backend/prisma/migrations`, `backend/src/routes`, tests and the GitHub Actions workflow. Run the **read-only** public smoke script to illustrate deployment verification.

## Suggested presentation narrative

> LOTUS CLINIC is a full-stack clinic workflow demo. I built the responsive website, Express API, role-specific dashboards and shared MySQL data model. The main challenge was connecting the full booking-to-consultation lifecycle while enforcing distinct patient, clinician and chief-doctor access. I used Prisma migrations, sessions, CSRF checks and automated release smoke tests. It is strictly a fictional-data portfolio prototype, not production medical software.

## Safe commands

```powershell
# From the repository root; performs only unauthenticated GET requests
node .\backend\scripts\public-smoke.js

# Unit-only smoke harness tests; does not write to MySQL
node --test .\backend\tests\unit\public-smoke.test.js
```

**Never run** `npm test` pointing at a live Aiven database: the existing API integration test creates records. Consult [QA_CHECKLIST.md](QA_CHECKLIST.md).

## Capturing screenshots for the portfolio

- Recommended captures: homepage, directory, a fictional appointment confirmation, clinician dashboard, chief-dashboard overview.
- Use a browser window with no address-bar extensions, notification popups or personal bookmarks visible.
- Keep screenshots free of passwords, cookies, private tokens, actual patient names, real phone numbers, medical documents and server environment variables.
- Suggested desktop viewport ~1440×900 and mobile viewport ~390×844; check that labels are legible and all interactive content is visible.
- The repository already has `lotus/preview-desktop.png` and `lotus/preview-mobile.png`. Replace these only after reviewing a sanitized real screenshot.

## Talking points / trade-offs

- Why vanilla JS? Direct control and minimal framework complexity; the trade-off is more manually managed UI state.
- Why Prisma + MySQL? Explicit relational constraints and versioned schema changes for bookings and consultations.
- Why sessions? Role checks stay server-side and sensitive auth state is not trusted to the client.
- What next? Better integration test coverage, restore drills, time-zone test cases, accessibility audit, and medical-grade compliance work if the product scope ever changes.
