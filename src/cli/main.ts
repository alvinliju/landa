#!/usr/bin/env node
/**
 * landa CLI — remote control plane client (host-first sessions).
 *
 * Zero-friction:
 *   landa login landa_…
 *   landa --login landa_…
 *   landa t3              # login if needed → sessions → console → t3 env
 *   landa --t3
 *
 * Open:
 *   landa -s landa -r <session-id>
 *   landa open -r <session-id|name>
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
import { runLogin } from "./login.js";
import { openSession } from "./open.js";
import { runT3 } from "./t3.js";

type GlobalFlags = {
  site?: string;
  base?: string;
  key?: string;
  session?: string;
  browser: boolean;
  start: boolean;
  loginKey?: string;
  t3: boolean;
  rest: string[];
};

function usage(): never {
  console.log(`landa — cloud computers for agents (host-first)

Start here:
  landa login [landa_…]          save API key (+ ask for base)
  landa --login landa_…
  landa t3                       login → session → console → launch bundled T3 (./t3)
  landa --t3                     same
  landa t3 --serve               headless t3 serve (pair phone/desktop)
  landa t3 --no-launch           setup only (no T3 process)

Open a session:
  landa -s landa -r <session-id>
  landa open -r <session-id|name>
  landa open myapp

Config:
  landa config show
  landa config set key landa_…
  landa config set base http://landa.tharavad.xyz
  landa whoami

Sessions:
  landa sessions
  landa create [--name n] [--repo url] [--boot]
  landa start|stop|destroy -r <id>
  landa status -r <id>

Files (host when stopped):
  landa files ls|cat|put -r <id> …

Exec (seat running):
  landa exec -r <id> -- <cmd…>

Flags:
  -s, --site <alias>     landa | local | URL
  -r, --session <id>     session id or name
  -k, --key <key>        API key
  -b, --base <url>       API base
  --no-browser
  --start                boot seat when opening
  --login [key]          same as landa login
  --t3                   same as landa t3
  --serve                with --t3 / t3: launch npx t3 serve

config: ${configPath()}
`);
  process.exit(0);
}

function parseGlobals(argv: string[]): GlobalFlags {
  const out: GlobalFlags = {
    browser: true,
    start: false,
    t3: false,
    rest: [],
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "-h" || a === "--help") usage();
    if (a === "--login") {
      const next = argv[i + 1];
      if (next && !next.startsWith("-") && next.startsWith("landa_")) {
        out.loginKey = argv[++i];
      } else {
        out.loginKey = ""; // interactive
      }
      continue;
    }
    if (a.startsWith("--login=")) {
      out.loginKey = a.slice("--login=".length);
      continue;
    }
    if (a === "--t3") {
      out.t3 = true;
      continue;
    }
    if (a === "--serve") {
      out.rest.push("--serve"); // picked up by t3
      continue;
    }
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

  const g0 = parseGlobals(argv);

  // landa --login [key]  |  landa login [key]
  if (g0.loginKey !== undefined) {
    await runLogin({
      key: g0.loginKey || g0.key || undefined,
      base: g0.base || (g0.site ? SITE_ALIASES[g0.site] ?? g0.site : undefined),
    });
    return;
  }

  // landa --t3 | landa t3  → always launches bundled T3 (unless --no-launch)
  if (g0.t3 || g0.rest[0] === "t3") {
    const rest = g0.rest[0] === "t3" ? g0.rest.slice(1) : g0.rest;
    const noLaunch =
      rest.includes("--no-launch") || argv.includes("--no-launch");
    const mode = rest.includes("--serve") || argv.includes("--serve")
      ? ("serve" as const)
      : ("start" as const);
    await runT3({
      key: g0.key,
      base: g0.base || (g0.site ? SITE_ALIASES[g0.site] ?? g0.site : undefined),
      session: g0.session,
      browser: g0.browser,
      mode,
      noLaunch,
    });
    return;
  }

  // bare flags only: landa -s landa -r <id>
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

  if (cmd === "login") {
    await runLogin({
      key: args[0] || g.key,
      base: g.base || (g.site ? SITE_ALIASES[g.site] ?? g.site : undefined),
    });
    return;
  }

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
