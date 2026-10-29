const { Prisma } = require("@prisma/client");

class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

function notFoundHandler(req, res) {
  res.status(404).json({ error: "Not found" });
}

// Centralized error handler. Never leaks stack traces, SQL, or internal file
// paths to the client ("safe error responses" in the project spec) — those go
// to the server log only.
function errorHandler(err, req, res, _next) {
  if (err instanceof ApiError) {
    return res.status(err.status).json({ error: err.message, details: err.details });
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      // Unique constraint violation — this is how the double-booking guard on
      // appointment_slots (doctorId, slotAt) surfaces to the booking endpoint.
      return res.status(409).json({ error: "This slot was just taken by someone else. Please pick another time." });
    }
    if (err.code === "P2025") {
      return res.status(404).json({ error: "Record not found" });
    }
  }

  if (err.name === "ZodError") {
    return res.status(400).json({ error: "Invalid input", details: err.issues });
  }

  // Unexpected error: log full detail server-side, return a generic message.
  // eslint-disable-next-line no-console
  console.error("[unhandled]", err);
  res.status(500).json({ error: "Internal server error" });
}

module.exports = { ApiError, notFoundHandler, errorHandler };
