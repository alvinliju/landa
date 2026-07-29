/** Local in-process plane CLI (legacy demos). */
import { createMemoryPlane, createPlane } from "../plane.js";

export async function runLocalCli(argv: string[]): Promise<void> {
  const [cmd, ...raw] = argv;
  if (cmd === "demo" || !cmd) {
    const which = (raw[0] as "memory" | "firecracker" | undefined) ?? "auto";
    const plane =
      which === "memory"
        ? createMemoryPlane()
        : await createPlane({
            firecracker: which === "firecracker" ? true : "auto",
            defaultBackend:
              which === "firecracker" ? "firecracker" : "memory",
          });
    console.log(`backends: ${plane.backends().join(", ")}`);
    const use = plane.backends().includes("firecracker")
      ? "firecracker"
      : "memory";
    const seat = await plane.create({
      name: "demo",
      backend: use,
      labels: { purpose: "demo" },
    });
    console.log(seat);
    console.log(await plane.exec(seat.id, { cmd: "echo hello-from-landa" }));
    await plane.destroy(seat.id);
    console.log("destroyed", seat.id);
    return;
  }
  throw new Error(`local plane: unknown ${cmd}`);
}
