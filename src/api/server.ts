import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { closeDb } from "../db.js";
import { createPlane } from "../plane.js";

const port = Number(process.env.LANDA_API_PORT ?? 8787);
// 127.0.0.1 local; 0.0.0.0 for public deploy
const hostname = process.env.LANDA_API_HOST ?? "127.0.0.1";

const plane = await createPlane({
  docker: process.env.LANDA_DOCKER === "0" ? false : "auto",
  defaultBackend:
    process.env.LANDA_BACKEND === "docker" ? "docker" : "memory",
});

const app = createApp(plane);

console.log(
  `landa-api listening on http://${hostname}:${port} backends=[${plane.backends().join(",")}]`,
);

serve({ fetch: app.fetch, port, hostname });

const shutdown = async () => {
  await closeDb();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
