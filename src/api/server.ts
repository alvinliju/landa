import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { closeDb } from "../db.js";

const port = Number(process.env.LANDA_API_PORT ?? 8787);
// 127.0.0.1 local; 0.0.0.0 for public deploy
const hostname = process.env.LANDA_API_HOST ?? "127.0.0.1";
const app = createApp();

console.log(`landa-api listening on http://${hostname}:${port}`);

serve({ fetch: app.fetch, port, hostname });

const shutdown = async () => {
  await closeDb();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
