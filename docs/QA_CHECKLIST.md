# LOTUS CLINIC — Release QA checklist

This is a **portfolio demonstration**, not healthcare software approved to store or process real patient information.

## Automated checks

From the repository root:

```bash
# Safe local tests: no MySQL / Aiven connection, no writes
node --test backend/tests/unit/public-smoke.test.js

# Read-only public production checks after Render is Live
node backend/scripts/public-smoke.js
```

Or GitHub → **Actions → Read-only live smoke test → Run workflow**. This workflow is deliberately **manual** so a Render cold start or partial deployment does not break every normal push. It uses no passwords or session cookies.

The public smoke test checks API health, public doctors/departments, a doctor profile, private routes without authentication, frontend CORS, a disallowed CORS origin, and the HTML of the home/patient/doctor pages. It never sends POST/PATCH/PUT/DELETE.

The existing `backend/tests/api.test.js` is **NOT safe against the production database**. It creates patient and appointment rows. Run it only against a **disposable test MySQL database** with separate credentials. Do not use `npm test` on Aiven production without checking its configuration.

If the prior quality upgrade is installed, also run from `backend/`:

```bash
npm run check:syntax
npm run test:unit
```

## Manual browser review (once per release)

- [ ] Browser network tab: no API 500 errors during normal page opening
- [ ] Phone width around 360px: menu, booking, patient/doctor dashboard work without horizontal overflow
- [ ] Keyboard: Tab navigation and Escape close the mobile menu and Flora chat
- [ ] After login/logout, header reflects the real current session
- [ ] Test patient books a future appointment; test doctor sees it and completes it
- [ ] Chief can see staff and room assignments after relogin on a different browser
- [ ] Only fictional records; no passwords, medical records, `.env` or screenshots of personal data committed
- [ ] Render API and static site both show current commit as Live

## Known risks and limitations

- No external penetration test or regulatory compliance review.
- Running the public smoke script checks only **anonymous** authorization gates; it cannot verify that a doctor cannot access another doctor's patients.
- UI accessibility is not fully WCAG-audited; automated test scripts do not substitute for manual screen-reader testing.
- Demo clinician and patient records should remain fictional and non-identifying.
- Render Free deployments may sleep, causing slow first responses; default smoke timeout is 90 seconds per endpoint.
- Production backups of Aiven must be reviewed independently before schema changes.
