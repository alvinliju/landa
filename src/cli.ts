#!/usr/bin/env node
import { createMemoryPlane, createPlane } from "./plane.js";
import { landaErrorToHttp } from "./control-plane.js";

function usage(): never {
  console.log(`landa — computers for agents

usage:
  landa demo [memory|docker]   full contract walk (create/exec/fs/snapshot/destroy)
  landa create [--backend m|d] [name]
  landa list
  landa get <id>
  landa exec <id> -- <cmd...>
  landa write <id> <path> <content>
  landa read <id> <path>
  landa snapshot <id>
  landa destroy <id>
  landa backends
  landa help

env:
  LANDA_BACKEND=memory|docker
  LANDA_DOCKER=1                 enable docker in plane
  LANDA_DOCKER_IMAGE=alpine:3.20
`);
  process.exit(0);
}

async function demo(backend: "memory" | "docker" | "auto") {
  const plane =
    backend === "memory"
      ? createMemoryPlane()
      : await createPlane({
          docker: backend === "docker" ? true : "auto",
          defaultBackend: backend === "docker" ? "docker" : "memory",
        });

  console.log(`backends: ${plane.backends().join(", ")}`);
  const use =
    backend === "docker"
      ? "docker"
      : backend === "memory"
        ? "memory"
        : plane.backends().includes("docker")
          ? "docker"
          : "memory";

  console.log(`\n→ create (${use})`);
  const seat = await plane.create({
    name: "demo",
    backend: use,
    labels: { purpose: "demo" },
  });
  console.log(seat);

  console.log("\n→ exec echo");
  console.log(await plane.exec(seat.id, { cmd: "echo hello-from-landa" }));

  console.log("\n→ exec uname");
  console.log(await plane.exec(seat.id, { cmd: "uname -a" }));

  console.log("\n→ writeFile / readFile");
  await plane.writeFile(seat.id, {
    path: "notes.txt",
    content: "agent was here\n",
  });
  console.log(await plane.readFile(seat.id, "notes.txt"));

  console.log("\n→ worldSnapshot");
  console.log(JSON.stringify(await plane.worldSnapshot(seat.id), null, 2));

  console.log("\n→ destroy");
  await plane.destroy(seat.id);
  console.log("destroyed", seat.id);
}

function parseBackendFlag(argv: string[]): {
  backend?: "memory" | "docker";
  rest: string[];
} {
  const rest: string[] = [];
  let backend: "memory" | "docker" | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--backend" || a === "-b") {
      const v = argv[++i];
      if (v === "m" || v === "memory") backend = "memory";
      else if (v === "d" || v === "docker") backend = "docker";
      else throw new Error(`unknown backend: ${v}`);
    } else if (a.startsWith("--backend=")) {
      const v = a.slice("--backend=".length);
      if (v === "m" || v === "memory") backend = "memory";
      else if (v === "d" || v === "docker") backend = "docker";
      else throw new Error(`unknown backend: ${v}`);
    } else {
      rest.push(a);
    }
  }
  return { backend, rest };
}

async function main() {
  const argv = process.argv.slice(2);
  const [cmd, ...raw] = argv;
  if (!cmd || cmd === "help" || cmd === "-h" || cmd === "--help") usage();

  if (cmd === "demo") {
    const which = (raw[0] as "memory" | "docker" | undefined) ?? "auto";
    await demo(which === "memory" || which === "docker" ? which : "auto");
    return;
  }

  const plane = await createPlane({
    docker: "auto",
    defaultBackend:
      process.env.LANDA_BACKEND === "docker" ? "docker" : "memory",
  });

  if (cmd === "backends") {
    console.log(plane.backends().join("\n"));
    return;
  }

  if (cmd === "create") {
    const { backend, rest } = parseBackendFlag(raw);
    const info = await plane.create({
      name: rest[0] ?? "seat",
      backend: backend ?? (process.env.LANDA_BACKEND as "memory" | "docker" | undefined),
    });
    console.log(JSON.stringify(info, null, 2));
    return;
  }

  if (cmd === "list") {
    console.log(JSON.stringify(await plane.list(), null, 2));
    return;
  }

  if (cmd === "get") {
    const id = raw[0];
    if (!id) throw new Error("usage: landa get <id>");
    console.log(JSON.stringify(await plane.get(id), null, 2));
    return;
  }

  if (cmd === "exec") {
    const id = raw[0];
    const dash = raw.indexOf("--");
    const cmdParts = dash >= 0 ? raw.slice(dash + 1) : raw.slice(1);
    if (!id || !cmdParts.length) throw new Error("usage: landa exec <id> -- <cmd>");
    console.log(
      JSON.stringify(await plane.exec(id, { cmd: cmdParts.join(" ") }), null, 2),
    );
    return;
  }

  if (cmd === "write") {
    const [id, path, ...contentParts] = raw;
    if (!id || !path) throw new Error("usage: landa write <id> <path> <content>");
    await plane.writeFile(id, { path, content: contentParts.join(" ") + "\n" });
    console.log("ok");
    return;
  }

  if (cmd === "read") {
    const [id, path] = raw;
    if (!id || !path) throw new Error("usage: landa read <id> <path>");
    console.log(JSON.stringify(await plane.readFile(id, path), null, 2));
    return;
  }

  if (cmd === "snapshot") {
    const id = raw[0];
    if (!id) throw new Error("usage: landa snapshot <id>");
    console.log(JSON.stringify(await plane.worldSnapshot(id), null, 2));
    return;
  }

  if (cmd === "destroy") {
    const id = raw[0];
    if (!id) throw new Error("usage: landa destroy <id>");
    await plane.destroy(id);
    console.log("destroyed", id);
    return;
  }

  console.error(`unknown command: ${cmd}`);
  usage();
}

main().catch((err) => {
  const http = landaErrorToHttp(err);
  console.error(JSON.stringify(http.body));
  process.exit(1);
});
