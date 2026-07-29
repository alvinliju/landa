import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";

export type LandaConfig = {
  apiKey?: string;
  apiBase?: string;
  /** last opened session id */
  lastSession?: string;
};

export const SITE_ALIASES: Record<string, string> = {
  landa: "http://landa.tharavad.xyz",
  local: "http://127.0.0.1:8787",
  localhost: "http://127.0.0.1:8787",
};

export function configPath(): string {
  return (
    process.env.LANDA_CONFIG ??
    join(homedir(), ".config", "landa", "config.json")
  );
}

export async function loadConfig(): Promise<LandaConfig> {
  try {
    const raw = await readFile(configPath(), "utf8");
    return JSON.parse(raw) as LandaConfig;
  } catch {
    return {};
  }
}

export async function saveConfig( partial: LandaConfig): Promise<LandaConfig> {
  const cur = await loadConfig();
  const next = { ...cur, ...partial };
  const path = configPath();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(next, null, 2) + "\n", "utf8");
  return next;
}

export function resolveBase(
  flagBase?: string,
  flagSite?: string,
  cfg?: LandaConfig,
): string {
  if (flagBase) return flagBase.replace(/\/$/, "");
  if (flagSite) {
    const a = SITE_ALIASES[flagSite.toLowerCase()];
    if (a) return a;
    if (/^https?:\/\//i.test(flagSite)) return flagSite.replace(/\/$/, "");
    throw new Error(
      `unknown site alias "${flagSite}" (try: ${Object.keys(SITE_ALIASES).join(", ")})`,
    );
  }
  if (process.env.LANDA_API_BASE)
    return process.env.LANDA_API_BASE.replace(/\/$/, "");
  if (cfg?.apiBase) return cfg.apiBase.replace(/\/$/, "");
  return SITE_ALIASES.landa!;
}

export function resolveKey(flagKey?: string, cfg?: LandaConfig): string {
  const key =
    flagKey || process.env.LANDA_API_KEY || cfg?.apiKey || "";
  if (!key) {
    throw new Error(
      "missing API key — set LANDA_API_KEY or run: landa config set key landa_…",
    );
  }
  return key;
}
