import { buildApp } from "./app";
import { loadConfig } from "./config";

/**
 * Production entry point. One instance per region; the frontend's server
 * registry decides which one a given visitor measures against.
 */
async function main(): Promise<void> {
  const config = loadConfig();
  const app = await buildApp(config);

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, "shutting down");
    try {
      await app.close();
      process.exit(0);
    } catch (err) {
      app.log.error(err, "error during shutdown");
      process.exit(1);
    }
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  try {
    await app.listen({ port: config.port, host: config.host });
    app.log.info(
      { region: config.region, server: config.serverName },
      `WifiPlus edge measurement server listening on ${config.host}:${config.port}`,
    );
  } catch (err) {
    app.log.error(err, "failed to start");
    process.exit(1);
  }
}

void main();
