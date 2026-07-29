import { LandaClient } from "./api.js";
import {
  loadConfig,
  resolveBase,
  saveConfig,
  SITE_ALIASES,
  configPath,
} from "./config.js";
import { ask, askRequired } from "./prompt.js";

export type LoginOpts = {
  key?: string;
  base?: string;
  /** non-interactive: fail if missing */
  quiet?: boolean;
};

/**
 * Save API key (+ optional base). Interactive when values missing.
 */
export async function runLogin(opts: LoginOpts = {}): Promise<{
  base: string;
  key: string;
}> {
  const cfg = await loadConfig();
  let key = opts.key?.trim() || process.env.LANDA_API_KEY || cfg.apiKey || "";
  let base =
    opts.base?.trim() ||
    process.env.LANDA_API_BASE ||
    cfg.apiBase ||
    "";

  if (!key) {
    if (opts.quiet) {
      throw new Error("missing API key — landa login <key>");
    }
    console.log("");
    console.log("landa login — paste a key from the console (API keys tab)");
    console.log(`  config → ${configPath()}`);
    key = await askRequired("API key (landa_…)");
  }

  if (!key.startsWith("landa_")) {
    console.warn("warning: key does not start with landa_ — continuing anyway");
  }

  if (!base) {
    if (opts.quiet) {
      base = SITE_ALIASES.landa!;
    } else {
      console.log("");
      console.log("API base (site). Aliases: landa | local");
      const raw = await ask("API base", {
        default: SITE_ALIASES.landa,
      });
      base =
        SITE_ALIASES[raw.toLowerCase()] ??
        (raw.startsWith("http") ? raw : SITE_ALIASES.landa!);
    }
  } else if (SITE_ALIASES[base.toLowerCase()]) {
    base = SITE_ALIASES[base.toLowerCase()]!;
  }

  base = base.replace(/\/$/, "");
  await saveConfig({ apiKey: key, apiBase: base });

  const client = new LandaClient(base, key);
  const me = await client.me();
  console.log("");
  console.log("✓ logged in");
  console.log(`  base     ${base}`);
  console.log(`  via      ${me.via ?? "?"}`);
  console.log(`  user     ${me.user?.email ?? me.user?.id ?? "?"}`);
  console.log(`  project  ${me.project?.slug ?? "?"}`);
  console.log(`  config   ${configPath()}`);
  console.log("");

  return { base, key };
}

export async function ensureLoggedIn(opts: LoginOpts = {}): Promise<{
  base: string;
  key: string;
  client: LandaClient;
}> {
  const cfg = await loadConfig();
  try {
    const base = resolveBase(opts.base, undefined, cfg);
    const key =
      opts.key || process.env.LANDA_API_KEY || cfg.apiKey || "";
    if (!key) throw new Error("no key");
    const client = new LandaClient(base, key);
    await client.me();
    return { base, key, client };
  } catch {
    const { base, key } = await runLogin(opts);
    return { base, key, client: new LandaClient(base, key) };
  }
}
