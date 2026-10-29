const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const morgan = require("morgan");

const env = require("./config/env");
const { sessionMiddleware } = require("./config/session");
const { apiLimiter } = require("./middleware/rateLimit");
const { auditMiddleware } = require("./middleware/audit");
const { notFoundHandler, errorHandler } = require("./middleware/errorHandler");

const authRoutes = require("./routes/auth.routes");
const publicRoutes = require("./routes/public.routes");
const appointmentsRoutes = require("./routes/appointments.routes");
const patientsRoutes = require("./routes/patients.routes");
const doctorRoutes = require("./routes/doctor.routes");
const adminRoutes = require("./routes/admin.routes");

const app = express();

// Render BigInt ids (user.id, appointment.id, ...) as JSON strings everywhere,
// instead of every controller having to convert them by hand. Doing it once
// here, globally, is less error-prone than remembering it per endpoint.
app.set("json replacer", (key, value) => (typeof value === "bigint" ? value.toString() : value));

app.set("trust proxy", 1); // Railway sits behind a proxy; needed for correct req.ip and secure cookies

app.use(helmet());
app.use(
  cors({
    origin(origin, callback) {
      // Allow same-origin / server-to-server calls (no Origin header) and anything
      // explicitly listed in CORS_ORIGINS (your Netlify URL + local dev origin).
      if (!origin || env.corsOrigins.includes(origin)) return callback(null, true);
      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true
  })
);
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());
app.use(morgan(env.isProd ? "combined" : "dev"));
app.use(sessionMiddleware);
app.use(auditMiddleware);
app.use(apiLimiter);

app.get("/api/health", (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.use("/api/auth", authRoutes);
app.use("/api", publicRoutes);
app.use("/api/appointments", appointmentsRoutes);
app.use("/api/patients", patientsRoutes);
app.use("/api/doctor", doctorRoutes);
app.use("/api/admin", adminRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
