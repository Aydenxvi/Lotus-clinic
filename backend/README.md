# LOTUS CLINIC — backend API

Express + MySQL (via Prisma) backend for the LOTUS CLINIC frontend in `../lotus`.
Session-based auth (Argon2id password hashes, HttpOnly cookies), server-side
RBAC (`patient` / `doctor` / `chief`), real appointment booking with
transactional double-booking protection, and audit logging.

**Honesty note on what has and hasn't been run.** This backend was written and
syntax-checked (`node --check` on every file) in a sandboxed environment with
no outbound network access and no MySQL/Docker available, so I could not run
`npm install`, `npx prisma generate/migrate`, start the server, or exercise a
single HTTP request end-to-end. Nothing below is a report of a test that
passed — it is the exact sequence you need to run yourself to actually bring
this up and verify it. Do that (see "Verifying it actually works" below)
before trusting this with anything beyond fictional test data.

## What's real vs. demo-only

Wired to this real database + API: authentication (register/login/logout/me),
doctor & department catalog, appointment booking/cancel/reschedule, doctor
schedule, doctor's view of their patients + consultations (ЭМК), admin staff
(doctor) CRUD, admin read-only patient directory, admin appointment
management, audit log.

Intentionally left as local-only demo features in `doctor-cabinet.html`
(stored in the browser's `localStorage`, not this database) because they
were not part of the required schema/endpoint list: pharmacy/stock, room
("Кабинеты") status board, lab queue, leave ("отгул") requests. Each of
those sections is now labeled in the UI as a demo-only section.

## Prerequisites

- Node.js 18+
- A MySQL 8 server (local install, Docker, or a hosted instance — see
  Railway section below for production)

## 1. Local setup — exact commands

```bash
cd backend
cp .env.example .env
# Edit .env: set DATABASE_URL to a real MySQL connection string, and set
# SESSION_SECRET / CSRF_SECRET to long random values, e.g.:
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

npm install                 # installs Express, Prisma, Argon2, etc.
npx prisma generate         # generates the Prisma client from schema.prisma
npx prisma migrate deploy   # applies prisma/migrations/0001_init against your DB
node prisma/seed.js         # imports departments + doctors from ../lotus/js/data.js,
                             # and creates the staff logins listed in
                             # prisma/seed-credentials.json (safe to re-run)

npm run dev                 # starts the API on http://localhost:4000 (auto-reload)
# or: npm start             # same, without auto-reload
```

If you don't have a local MySQL server, the fastest path is Docker:

```bash
docker run --name lotus-mysql -e MYSQL_ROOT_PASSWORD=change_me \
  -e MYSQL_DATABASE=lotus_clinic -p 3306:3306 -d mysql:8
# then DATABASE_URL="mysql://root:change_me@localhost:3306/lotus_clinic"
```

### Health check

```bash
curl http://localhost:4000/api/health
# => {"ok":true,"time":"..."}
```

## 2. Running the frontend against this backend

The frontend is static HTML/JS in `../lotus` — no build step. `js/api.js`
reads the API base URL from `window.LOTUS.apiBase`, set in `js/data.js`:

```js
apiBase: "http://localhost:4000/api",
```

Serve the frontend with any static file server (it must be a real HTTP
origin, not `file://`, for cookies/CORS to work), e.g.:

```bash
cd ../lotus
npx serve -l 8000        # or: python3 -m http.server 8000
```

Then make sure the backend's `CORS_ORIGINS` in `.env` includes that origin
(`http://localhost:8000`), and open `http://localhost:8000/index.html`.

## 3. Seeded accounts (fictional test data only)

`prisma/seed.js` creates staff logins from `prisma/seed-credentials.json`
(16 accounts: `dilbar`/`Lotos-2026` as chief/admin, the rest as doctors with
password `lotos` — e.g. `cardio`/`lotos`). These are fictional demo
credentials for local testing, not real people's passwords — change them
through the real admin panel (`PATCH /api/admin/doctors/:id`) once you have
real staff, and you can then blank out or delete `seed-credentials.json`.

Set `SEED_DEMO_ACCOUNTS=true` in `.env` before seeding to also create one
demo **patient** login: phone `+996700000000`, password `DemoPatient123!`.
Leave it `false` in anything resembling production.

## 4. Verifying it actually works (do this yourself)

This is the 10-point checklist from the original spec. None of it has been
run in this sandbox — run it against your local setup above:

1. Register a new patient at `cabinet.html` → confirm login works after logout.
2. Log in as a doctor (e.g. `cardio` / `lotos`) and as chief (`dilbar` /
   `Lotos-2026`) at `doctor-cabinet.html`.
3. Book a real appointment as the patient from `doctors.html` /
   `appointment.html` and confirm it appears in `cabinet.html`.
4. Open two browser sessions (or incognito) as two different patients and
   try to book the *same* slot at the same time — confirm only one succeeds
   (409 for the loser). This exercises the `$transaction` + unique-constraint
   guard in `src/services/booking.service.js`.
5. Confirm the booked appointment shows up on the doctor's schedule in
   `doctor-cabinet.html` (same database, no manual sync step).
6. As the doctor, open "История болезни" for that patient and confirm it
   shows their real chart via `GET /api/doctor/patients/:id`.
7. As the patient, confirm you can only see your own appointments
   (`GET /api/appointments/me`) — try hitting another patient's appointment
   id via the API directly and confirm you get a 403/404, not their data.
8. Try calling a `chief`-only endpoint (e.g. `POST /api/admin/doctors`) while
   logged in as a plain `doctor` — confirm 403, proving the frontend's
   `requireChief()` UI guard isn't the only thing stopping it.
9. Restart the backend process (`Ctrl+C`, `npm run dev` again) without
   touching the database, and confirm all data (users, appointments,
   consultations) is still there — proving persistence isn't in-memory.
10. Check `GET /api/admin/audit-logs` (as chief) and confirm login/register/
    booking/consultation actions were recorded.

## 5. Deploying the backend + database to Railway

1. Push this repo (or just the `backend/` folder) to GitHub.
2. In Railway: **New Project → Deploy from GitHub repo**, pick this repo, and
   set the service's root directory to `backend/` if it's a monorepo.
3. **New → Database → Add MySQL** in the same Railway project. Railway gives
   you a `DATABASE_URL`-shaped connection string — copy it.
4. On the backend service, set these **Variables** (Railway's env var UI):
   - `DATABASE_URL` — paste Railway's MySQL connection string
   - `SESSION_SECRET`, `CSRF_SECRET` — long random values (generate as above)
   - `NODE_ENV=production`
   - `COOKIE_SECURE=true` (Railway serves HTTPS)
   - `CORS_ORIGINS=https://your-site.netlify.app` (your actual Netlify URL,
     comma-separated if you have more than one, e.g. a custom domain too)
   - `PORT` — leave unset; Railway injects its own `PORT` and `src/server.js`
     reads `process.env.PORT`
5. Set the **Deploy → Start Command** (or a `railway.json`/`Procfile`) to run
   migrations then start the server, since Railway doesn't run a seed/migrate
   step for you automatically:
   ```
   npx prisma migrate deploy && node prisma/seed.js && node src/server.js
   ```
   (Drop `&& node prisma/seed.js` after the first successful deploy if you
   don't want it re-checked on every restart — it's safe to leave, since
   `seed.js` only upserts and never overwrites an existing password.)
6. Deploy, then confirm `https://<your-railway-app>.up.railway.app/api/health`
   returns `{"ok":true,...}`.

## 6. Deploying the frontend to Netlify

The frontend (`../lotus`) is static files — no build command needed.

1. In Netlify: **Add new site → Import an existing project**, point it at the
   `lotus/` folder (or the repo root with a "Base directory" of `lotus` if
   it's a monorepo). Build command: none / leave blank. Publish directory:
   `.` (the `lotus` folder itself).
2. Before deploying, edit `lotus/js/data.js` and change:
   ```js
   apiBase: "http://localhost:4000/api",
   ```
   to your real Railway URL, e.g.:
   ```js
   apiBase: "https://<your-railway-app>.up.railway.app/api",
   ```
   (Or wire this up as a Netlify env var + a tiny build step if you want one
   `data.js` for all environments — not set up here since the frontend has
   no build step today.)
3. Deploy, then add the resulting Netlify URL (e.g.
   `https://lotus-clinic.netlify.app`) to the backend's `CORS_ORIGINS` on
   Railway and redeploy the backend so the browser's cross-origin cookie
   requests are allowed.

## 7. External credentials/services this needs

- A MySQL database reachable from wherever the backend runs (local MySQL/
  Docker for dev; Railway's managed MySQL — or any other MySQL host — for
  production). No managed MySQL account is already set up; you need to
  create one.
- No other third-party service (no email/SMS provider, no payment
  processor) is required or used by this backend.
- `SESSION_SECRET` and `CSRF_SECRET` are generated locally (see command
  above) — they are not external credentials, just secrets you create.

## 8. Backup & recovery

This project does not set up managed backups for you — that's an
infrastructure decision tied to wherever you host MySQL. What you should do:

- **Railway's managed MySQL**: Railway takes periodic volume snapshots for
  database plugins, but verify current retention/restore behavior in the
  Railway dashboard for your plan — don't rely on this alone for anything
  beyond demo data.
- **Manual logical backup** (works anywhere, run on a schedule via cron or a
  CI job):
  ```bash
  mysqldump --single-transaction -h <host> -u <user> -p <database> \
    > lotus_clinic_$(date +%F).sql
  ```
  Restore with:
  ```bash
  mysql -h <host> -u <user> -p <database> < lotus_clinic_2026-01-01.sql
  ```
- Keep `prisma/migrations/` and `prisma/seed-credentials.json` (or your
  rotated replacement) in version control — schema and the one-time seed
  path should be reproducible from source, not just from a DB snapshot.
- Audit log (`audit_logs` table / `GET /api/admin/audit-logs`) is
  append-only and included in the same DB backup — no separate export step.

## 9. Security review disclaimer

This implementation follows the security practices requested (Argon2id
hashing, HttpOnly/SameSite cookies, CSRF protection, server-side RBAC,
parameterized queries via Prisma, rate limiting, audit logging, no secrets
in the repo). **It has not been through an independent security review or
any applicable healthcare-privacy compliance verification (e.g. HIPAA or
your local equivalent), and none of the automated/manual tests above have
actually been executed against a live instance in this sandbox.** Treat it
as a solid starting point for real patient data only after you've done that
review and run the checklist in section 4 yourself. Use fictional test
patients until then.
