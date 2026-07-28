/**
 * raw SQL migrations — files in migrations/*.sql applied in sort order
 */
import { createHash, randomBytes } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = path.join(root, "migrations");

function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is required");
  }
  return url;
}

function hashKey(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

async function migrate() {
  const sql = postgres(databaseUrl(), { max: 1 });
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;
    // need pgcrypto for gen_random_uuid in 001 if run on empty db
    await sql`CREATE EXTENSION IF NOT EXISTS pgcrypto`;

    const files = (await readdir(migrationsDir))
      .filter((f) => f.endsWith(".sql"))
      .sort();

    for (const file of files) {
      const id = file;
      const [{ exists }] = await sql<{ exists: boolean }[]>`
        SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE id = ${id}) AS exists
      `;
      if (exists) {
        console.log(`skip  ${id}`);
        continue;
      }
      const body = await readFile(path.join(migrationsDir, file), "utf8");
      console.log(`apply ${id}`);
      await sql.begin(async (tx) => {
        // strip schema_migrations create from 001 if duplicate — use unsafe for full file
        await tx.unsafe(body);
        await tx`
          INSERT INTO schema_migrations (id) VALUES (${id})
          ON CONFLICT (id) DO NOTHING
        `;
      });
    }
    console.log("migrations ok");
  } finally {
    await sql.end({ timeout: 5 });
  }
}

/** create dev api key if none */
async function seed() {
  const sql = postgres(databaseUrl(), { max: 1 });
  try {
    const projectId = "00000000-0000-4000-8000-000000000001";
    const existing = await sql`
      SELECT id FROM api_keys
      WHERE project_id = ${projectId}::uuid AND revoked_at IS NULL
      LIMIT 1
    `;
    if (existing.length > 0) {
      console.log("seed: api key already exists (not re-printed)");
      return;
    }
    const raw = `landa_dev_${randomBytes(24).toString("hex")}`;
    const prefix = raw.slice(0, 12);
    const keyHash = hashKey(raw);
    await sql`
      INSERT INTO api_keys (project_id, label, key_prefix, key_hash)
      VALUES (${projectId}::uuid, 'dev', ${prefix}, ${keyHash})
    `;
    console.log("seed: project slug=dev");
    console.log(`seed: API key (save once):\n  ${raw}`);
    console.log(`  export LANDA_API_KEY=${raw}`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

const cmd = process.argv[2] ?? "up";
if (cmd === "up") {
  await migrate();
} else if (cmd === "seed") {
  await seed();
} else if (cmd === "fresh") {
  await migrate();
  await seed();
} else {
  console.error("usage: migrate.ts [up|seed|fresh]");
  process.exit(1);
}
