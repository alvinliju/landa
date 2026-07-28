#!/usr/bin/env node
import { ControlPlane } from "./control-plane.js";
import { MemoryBackend } from "./backends/memory.js";

function usage(): never {
  console.log(`landa — computers for agents

usage:
  landa demo              run in-memory computer demo
  landa create [name]     create a seat
  landa list              list seats (memory process only)
  landa help

env:
  LANDA_BACKEND=memory    (default; e2b stub not wired)
`);
  process.exit(0);
}

async function demo() {
  const plane = new ControlPlane(new MemoryBackend());
  console.log(`backend: ${plane.backendName}`);

  const seat = await plane.create({ name: "demo", labels: { purpose: "demo" } });
  console.log("created", seat);

  const echo = await plane.exec(seat.id, { cmd: "echo hello-from-landa" });
  console.log("exec", echo);

  await plane.writeFile(seat.id, {
    path: "notes.txt",
    content: "agent was here\n",
  });
  const file = await plane.readFile(seat.id, "notes.txt");
  console.log("read", file);

  const world = await plane.snapshot(seat.id);
  console.log("world snapshot\n", JSON.stringify(world, null, 2));

  await plane.destroy(seat.id);
  console.log("destroyed", seat.id);
}

async function main() {
  const [cmd, arg] = process.argv.slice(2);
  if (!cmd || cmd === "help" || cmd === "-h" || cmd === "--help") usage();

  if (cmd === "demo") {
    await demo();
    return;
  }

  const plane = new ControlPlane(new MemoryBackend());

  if (cmd === "create") {
    const info = await plane.create({ name: arg ?? "seat" });
    console.log(JSON.stringify(info, null, 2));
    return;
  }

  if (cmd === "list") {
    console.log(JSON.stringify(await plane.list(), null, 2));
    return;
  }

  console.error(`unknown command: ${cmd}`);
  usage();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
