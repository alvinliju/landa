#!/usr/bin/env node
/**
 * landa CLI — remote control plane client (host-first sessions).
 *
 * Quick open:
 *   landa -s landa -r <session-id>
 *   landa open -r <session-id|name>
 *   landa open myapp
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { LandaClient } from "./api.js";
import {
  loadConfig,
  resolveBase,
  resolveKey,
  saveConfig,
  SITE_ALIASES,
  configPath,
} from "./config.js";
import { openSession } from "./open.js";

type GlobalFlags = {
  site?: string;
  base?: string;
  key?: string;
  session?: string;
  browser: boolean;
  start: boolean;
  rest: string[];
};

function usage(): never {
  console.log(`landa — cloud sessions (host-first)

Open a session (console + workspace + env):
  landa -s landa -r <session-id>
  landa open -r <session-id|name>
  landa open <name>

Config:
  landa config set key landa_…
  landa config set base http://landa.tharavad.xyz
  landa config show
  landa whoami

Sessions:
  landa sessions                      list
  landa create [--name n] [--repo url] [--boot]
  landa start|stop|destroy -r <id>
  landa status -r <id>

Files (host when stopped, seat when running):
  landa files ls -r <id> [path]
  landa files cat -r <id> <path>
  landa files put -r <id> <remote-path> <local-file>

Exec (seat must be running):
  landa exec -r <id> -- <cmd…>
  landa start -r <id> && landa exec -r <id> -- uname -a

Flags (global):
  -s, --site <alias>     landa | local | http://…   (default: landa)
  -r, --session <id>     session id or name
  -k, --key <key>        API key (else LANDA_API_KEY / config)
  -b, --base <url>       API base override
  --no-browser           don't open console
  --start                boot seat when opening

env:
  LANDA_API_KEY  LANDA_API_BASE  LANDA_CONFIG
  config file: ${configPath()}
`);
  process.exit(0);
}

function parseGlobals(argv: string[]): GlobalFlags {
  const out: GlobalFlags = { browser: true, start: false, rest: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "-h" || a === "--help") usage();
    if (a === "-s" || a === "--site" || a === "--server") {
      out.site = argv[++i];
      continue;
    }
    if (a.startsWith("--site=")) {
      out.site = a.slice("--site=".length);
      continue;
    }
    if (a === "-r" || a === "--session" || a === "--run") {
      out.session = argv[++i];
      continue;
    }
    if (a.startsWith("--session=")) {
      out.session = a.slice("--session=".length);
      continue;
    }
    if (a === "-k" || a === "--key") {
      out.key = argv[++i];
      continue;
    }
    if (a.startsWith("--key=")) {
      out.key = a.slice("--key=".length);
      continue;
    }
    if (a === "-b" || a === "--base") {
      out.base = argv[++i];
      continue;
    }
    if (a.startsWith("--base=")) {
      out.base = a.slice("--base=".length);
      continue;
    }
    if (a === "--no-browser") {
      out.browser = false;
      continue;
    }
    if (a === "--start" || a === "--boot") {
      out.start = true;
      continue;
    }
    out.rest.push(a);
  }
  return out;
}

async function clientFrom(g: GlobalFlags): Promise<LandaClient> {
  const cfg = await loadConfig();
  const base = resolveBase(g.base, g.site, cfg);
  const key = resolveKey(g.key, cfg);
  return new LandaClient(base, key);
}

function needSession(g: GlobalFlags, positional?: string): string {
  const s = g.session || positional || process.env.LANDA_SESSION_ID;
  if (!s) {
    throw new Error("need session: -r <id|name> or pass as argument");
  }
  return s;
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0) usage();

  // bare flags only: landa -s landa -r <id>
  const g0 = parseGlobals(argv);
  if (
    g0.rest.length === 0 &&
    (g0.session || g0.site) &&
    !["config", "help"].includes(g0.rest[0] ?? "")
  ) {
    if (!g0.session) {
      // landa -s landa → list / whoami
      const client = await clientFrom(g0);
      const me = await client.me();
      console.log(
        `base ${client.base}\nvia  ${me.via ?? "?"}\nuser ${me.user?.email ?? me.user?.id ?? "?"}\nproject ${me.project?.slug ?? "?"}`,
      );
      const { sessions } = await client.sessions();
      if (!sessions.length) {
        console.log("\nno sessions — landa create --name main");
        return;
      }
      console.log("\nsessions:");
      for (const s of sessions) {
        console.log(
          `  ${s.status.padEnd(10)} ${s.name.padEnd(20)} ${s.id}  filesVia=${s.filesVia ?? "?"}`,
        );
      }
      return;
    }
    const client = await clientFrom(g0);
    await openSession(client, g0.session, {
      browser: g0.browser,
      start: g0.start,
    });
    return;
  }

  const g = parseGlobals(argv);
  const [cmd, ...args] = g.rest;
  if (!cmd || cmd === "help") usage();

  if (cmd === "config") {
    const sub = args[0];
    if (sub === "show" || !sub) {
      const cfg = await loadConfig();
      console.log(JSON.stringify({ path: configPath(), ...cfg, apiKey: cfg.apiKey ? `${cfg.apiKey.slice(0, 12)}…` : undefined }, null, 2));
      console.log("aliases:", SITE_ALIASES);
      return;
    }
    if (sub === "set" && args[1] === "key" && args[2]) {
      await saveConfig({ apiKey: args[2] });
      console.log("saved key →", configPath());
      return;
    }
    if (sub === "set" && args[1] === "base" && args[2]) {
      await saveConfig({ apiBase: args[2].replace(/\/$/, "") });
      console.log("saved base →", configPath());
      return;
    }
    throw new Error("usage: landa config set key|base <value> | landa config show");
  }

  const client = await clientFrom(g);

  if (cmd === "whoami" || cmd === "me") {
    const me = await client.me();
    console.log(JSON.stringify({ base: client.base, ...me }, null, 2));
    return;
  }

  if (cmd === "open" || cmd === "o") {
    const id = needSession(g, args[0]);
    await openSession(client, id, { browser: g.browser, start: g.start });
    return;
  }

  if (cmd === "sessions" || cmd === "ls" || cmd === "list") {
    const { sessions, editMode } = await client.sessions();
    console.log(`editMode=${editMode ?? "host-first"}  base=${client.base}`);
    if (!sessions.length) {
      console.log("(none)");
      return;
    }
    for (const s of sessions) {
      console.log(
        `${s.status.padEnd(10)} ${s.name.padEnd(22)} ${s.id}  via=${s.filesVia ?? "?"}`,
      );
    }
    return;
  }

  if (cmd === "create") {
    let name: string | undefined;
    let repo: string | undefined;
    let boot = false;
    for (let i = 0; i < args.length; i++) {
      if (args[i] === "--name" || args[i] === "-n") name = args[++i];
      else if (args[i] === "--repo") repo = args[++i];
      else if (args[i] === "--boot" || args[i] === "--start") boot = true;
      else if (!name && !args[i]!.startsWith("-")) name = args[i];
    }
    const { session, hint } = await client.createSession({ name, repo, boot });
    console.log(JSON.stringify(session, null, 2));
    if (hint) console.log(hint);
    await openSession(client, session.id, {
      browser: g.browser,
      start: false,
    });
    return;
  }

  if (cmd === "status" || cmd === "get") {
    const id = needSession(g, args[0]);
    const { session, hint } = await client.session(
      (await client.resolveSession(id)).id,
    );
    console.log(JSON.stringify(session, null, 2));
    if (hint) console.log("\n" + hint);
    return;
  }

  if (cmd === "start") {
    const id = (await client.resolveSession(needSession(g, args[0]))).id;
    console.log(await client.startSession(id));
    return;
  }

  if (cmd === "stop") {
    const id = (await client.resolveSession(needSession(g, args[0]))).id;
    console.log(await client.stopSession(id));
    return;
  }

  if (cmd === "destroy" || cmd === "rm") {
    const id = (await client.resolveSession(needSession(g, args[0]))).id;
    console.log(await client.destroySession(id));
    return;
  }

  if (cmd === "exec" || cmd === "x") {
    const id = (await client.resolveSession(needSession(g, args[0]))).id;
    const dd = args.indexOf("--");
    const cmdParts = dd >= 0 ? args.slice(dd + 1) : args.slice(1);
    if (!cmdParts.length) throw new Error("usage: landa exec -r <id> -- <cmd…>");
    const { result } = await client.exec(id, cmdParts.join(" "));
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    process.exitCode = result.exitCode;
    return;
  }

  if (cmd === "files" || cmd === "f") {
    const sub = args[0];
    // Prefer global -r; else first non-flag after sub
    const sidArg = g.session ?? args[1];
    if (!sub) throw new Error("usage: landa files ls|cat|put -r <id> …");
    if (!sidArg && sub !== "ls") {
      throw new Error("need -r <session>");
    }
    const sid = sidArg
      ? (await client.resolveSession(sidArg)).id
      : (await client.resolveSession(needSession(g))).id;

    if (sub === "ls" || sub === "list") {
      // landa files ls -r id [/path]  OR  landa files ls [/path] with -r global
      const path = g.session
        ? args[1] || "/workspace"
        : args[2] || "/workspace";
      const r = await client.listFiles(sid, path);
      console.log(`via=${r.via ?? "?"}`);
      for (const e of r.entries ?? []) {
        console.log(
          `${(e.kind ?? "?").padEnd(10)} ${String(e.size ?? "").padStart(8)}  ${e.path}`,
        );
      }
      return;
    }
    if (sub === "cat" || sub === "get") {
      const path = g.session ? args[1] : args[2];
      if (!path) throw new Error("usage: landa files cat -r <id> /workspace/file");
      const r = await client.readFile(sid, path);
      process.stdout.write(r.file.content);
      return;
    }
    if (sub === "put" || sub === "write") {
      const remote = g.session ? args[1] : args[2];
      const local = g.session ? args[2] : args[3];
      if (!remote || !local) {
        throw new Error(
          "usage: landa files put -r <id> /workspace/path ./local-file",
        );
      }
      const content = await readFile(resolve(local), "utf8");
      const r = await client.writeFile(sid, remote, content);
      console.log(JSON.stringify(r));
      return;
    }
    throw new Error("usage: landa files ls|cat|put -r <id> …");
  }

  // legacy local plane demos
  if (cmd === "plane" || cmd === "demo") {
    const { runLocalCli } = await import("./local.js");
    await runLocalCli(cmd === "demo" ? ["demo", ...args] : args);
    return;
  }

  throw new Error(`unknown command: ${cmd} (try landa help)`);
}

main().catch((e) => {
  console.error("error:", e instanceof Error ? e.message : e);
  process.exit(1);
});
