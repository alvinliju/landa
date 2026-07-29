import * as readline from "node:readline";

export function ask(question: string, opts?: { default?: string; secret?: boolean }): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const def = opts?.default;
  const hint = def ? ` [${def}]` : "";
  return new Promise((resolve) => {
    rl.question(`${question}${hint}: `, (answer) => {
      rl.close();
      const v = (answer ?? "").trim();
      resolve(v || def || "");
    });
  });
}

export async function askRequired(
  question: string,
  opts?: { default?: string },
): Promise<string> {
  for (;;) {
    const v = await ask(question, opts);
    if (v) return v;
    console.log("  (required)");
  }
}
