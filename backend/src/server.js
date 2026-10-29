const app = require("./app");
const env = require("./config/env");
const { disconnectDb } = require("./config/db");

const server = app.listen(env.port, () => {
  // eslint-disable-next-line no-console
  console.log(`LOTUS CLINIC API listening on port ${env.port} (${env.nodeEnv})`);
});

async function shutdown(signal) {
  // eslint-disable-next-line no-console
  console.log(`Received ${signal}, shutting down...`);
  server.close(async () => {
    await disconnectDb();
    process.exit(0);
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

module.exports = server;
