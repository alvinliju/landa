import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { closeDb } from "../db.js";

const port = Number(process.env.LANDA_API_PORT ?? 8787);
const app = createApp();

console.log(`landa-api listening on http://127.0.0.1:${port}`);

serve({ fetch: app.fetch, port, hostname: "127.0.0.1" });

const shutdown = async () => {
  await closeDb();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
