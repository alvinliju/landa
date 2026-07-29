import { randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import {
  access,
  mkdir,
  writeFile,
  rm,
  chmod,
} from "node:fs/promises";
import { constants } from "node:fs";
import { isAbsolute, join } from "node:path";
import type {
  ComputerBackend,
  ComputerId,
  ComputerInfo,
  ComputerSpec,
  ExecRequest,
  ExecResult,
  FileEntry,
  FileRead,
  FileWrite,
} from "../types.js";
import {
  BackendError,
  ComputerNotFoundError,
  ComputerNotRunningError,
  FileNotFoundError,
} from "../errors.js";

type Seat = {
  info: ComputerInfo;
  slot: number;
  tap: string;
  guestIp: string;
  hostIp: string;
  rootfs: string;
  configPath: string;
  proc: ChildProcess | null;
  createdMs: number;
};

export type FirecrackerOptions = {
  assetsDir?: string;
  seatsDir?: string;
  kernel?: string;
  rootfs?: string;
  sshKey?: string;
  firecrackerBin?: string;
  memMiB?: number;
  vcpu?: number;
  /** wait for SSH (ms); alpine target <2s, default 15s */
  sshTimeoutMs?: number;
};

const DEFAULT_ASSETS =
  process.env.LANDA_FC_ASSETS ??
  join(process.env.LANDA_ROOT ?? process.cwd(), "firecracker/assets");

function pickDefaultRootfs(assets: string): string {
  const env = process.env.LANDA_FC_ROOTFS;
  if (env) return env;
  // prefer alpine / landa-lite over heavy ubuntu hello-rootfs
  for (const name of [
    "alpine-rootfs.ext4",
    "landa-rootfs.ext4",
    "hello-rootfs.ext4",
  ]) {
    // existence checked at create time
    void name;
  }
  return join(assets, "alpine-rootfs.ext4");
}

/**
 * Firecracker microVMs (Linux + KVM + CAP_NET_ADMIN).
 * Alpine + dropbear target: cold create → SSH under ~2s.
 */
export class FirecrackerBackend implements ComputerBackend {
  readonly name = "firecracker" as const;
  private seats = new Map<ComputerId, Seat>();
  private usedSlots = new Set<number>();
  private readonly assetsDir: string;
  private readonly seatsDir: string;
  private readonly defaultKernel: string;
  private readonly defaultRootfs: string;
  private readonly sshKey: string;
  private readonly fcBin: string;
  private readonly memMiB: number;
  private readonly vcpu: number;
  private readonly sshTimeoutMs: number;

  constructor(opts: FirecrackerOptions = {}) {
    this.assetsDir = opts.assetsDir ?? DEFAULT_ASSETS;
    this.seatsDir =
      opts.seatsDir ??
      process.env.LANDA_FC_SEATS ??
      join(this.assetsDir, "seats");
    this.defaultKernel =
      opts.kernel ??
      process.env.LANDA_FC_KERNEL ??
      join(this.assetsDir, "vmlinux.bin");
    this.defaultRootfs = opts.rootfs ?? pickDefaultRootfs(this.assetsDir);
    this.sshKey =
      opts.sshKey ??
      process.env.LANDA_FC_SSH_KEY ??
      join(this.assetsDir, "hello-id_rsa");
    this.fcBin =
      opts.firecrackerBin ?? process.env.FIRECRACKER_BIN ?? "firecracker";
    this.memMiB = opts.memMiB ?? Number(process.env.LANDA_FC_MEM_MIB ?? 128);
    this.vcpu = opts.vcpu ?? Number(process.env.LANDA_FC_VCPU ?? 1);
    this.sshTimeoutMs =
      opts.sshTimeoutMs ??
      Number(process.env.LANDA_FC_SSH_TIMEOUT_MS ?? 15_000);
  }

  private resolveAsset(p: string | undefined, fallback: string): string {
    if (!p) return fallback;
    if (isAbsolute(p)) return p;
    // template paths like "assets/alpine-rootfs.ext4"
    const stripped = p.replace(/^assets\//, "");
    return join(this.assetsDir, stripped);
  }

  async create(spec: ComputerSpec): Promise<ComputerInfo> {
    const kernel = await firstExisting([
      this.resolveAsset(spec.kernel, this.defaultKernel),
      join(this.assetsDir, "vmlinux.bin"),
      join(this.assetsDir, "hello-vmlinux.bin"),
    ]);
    const baseRootfs = this.resolveAsset(
      spec.rootfs ?? spec.image,
      this.defaultRootfs,
    );
    // fallback chain if alpine missing
    const rootfsBase = await firstExisting([
      baseRootfs,
      join(this.assetsDir, "alpine-rootfs.ext4"),
      join(this.assetsDir, "landa-rootfs.ext4"),
      join(this.assetsDir, "hello-rootfs.ext4"),
    ]);
    await this.requireFiles([kernel, rootfsBase, this.sshKey]);
    await chmod(this.sshKey, 0o600).catch(() => undefined);

    const slot = this.allocSlot();
    const id = `fc_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
    const { tap, guestIp, hostIp } = slotNet(slot);
    const t0 = Date.now();
    const rootfs = join(this.seatsDir, `${id}.ext4`);
    const configPath = join(this.seatsDir, `${id}.json`);
    const mac = `02:FC:00:${hex2(slot)}:00:05`;

    const info: ComputerInfo = {
      id,
      status: "creating",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      backend: this.name,
      spec: { ...spec, backend: this.name, rootfs: rootfsBase, kernel },
      endpoints: { ssh: `root@${guestIp}` },
    };
    const seat: Seat = {
      info,
      slot,
      tap,
      guestIp,
      hostIp,
      rootfs,
      configPath,
      proc: null,
      createdMs: t0,
    };
    this.seats.set(id, seat);

    try {
      await mkdir(this.seatsDir, { recursive: true });
      // sparse/CoW clone — critical for <2s (96Mi alpine vs 1Gi ubuntu)
      await sparseClone(rootfsBase, rootfs);
      await this.setupTap(tap, hostIp);

      // init=/init for alpine custom init; Ubuntu images ignore unknown init if linked
      const bootArgs = [
        "console=ttyS0",
        "reboot=k",
        "panic=1",
        "pci=off",
        "nomodules",
        "random.trust_cpu=on",
        "init=/init",
        `ip=${guestIp}::${hostIp}:255.255.255.252::eth0:off`,
      ].join(" ");

      const config = {
        "boot-source": {
          kernel_image_path: kernel,
          boot_args: bootArgs,
        },
        drives: [
          {
            drive_id: "rootfs",
            path_on_host: rootfs,
            is_root_device: true,
            is_read_only: false,
          },
        ],
        "network-interfaces": [
          {
            iface_id: "eth0",
            guest_mac: mac,
            host_dev_name: tap,
          },
        ],
        "machine-config": {
          vcpu_count: spec.vcpu ?? this.vcpu,
          mem_size_mib: spec.memoryMiB ?? this.memMiB,
          smt: false,
        },
      };
      await writeFile(configPath, JSON.stringify(config));

      const proc = spawn(this.fcBin, ["--no-api", "--config-file", configPath], {
        stdio: ["ignore", "pipe", "pipe"],
        detached: false,
      });
      seat.proc = proc;
      let stderr = "";
      proc.stderr?.on("data", (d: Buffer) => {
        stderr += d.toString();
        if (stderr.length > 8000) stderr = stderr.slice(-4000);
      });
      proc.on("exit", (code) => {
        if (seat.info.status === "running" || seat.info.status === "creating") {
          seat.info = {
            ...seat.info,
            status: "error",
            error: `firecracker exited ${code}: ${stderr.slice(-500)}`,
            updatedAt: new Date().toISOString(),
          };
        }
      });

      await waitForSsh(guestIp, this.sshKey, this.sshTimeoutMs);
      const elapsed = Date.now() - t0;
      seat.info = {
        ...seat.info,
        status: "running",
        updatedAt: new Date().toISOString(),
        endpoints: {
          ssh: `ssh -i ${this.sshKey} root@${guestIp}`,
        },
      };
      // stash timing in labels-ish via metadata on return (spec)
      seat.info.spec = {
        ...seat.info.spec,
        labels: {
          ...(seat.info.spec.labels ?? {}),
          createMs: String(elapsed),
        },
      };
      return { ...seat.info };
    } catch (e) {
      await this.cleanupSeat(seat).catch(() => undefined);
      this.seats.delete(id);
      this.usedSlots.delete(slot);
      throw new BackendError(this.name, `firecracker create failed: ${e}`, {
        id,
      });
    }
  }

  async get(id: ComputerId): Promise<ComputerInfo | null> {
    const s = this.seats.get(id);
    return s ? { ...s.info } : null;
  }

  async list(): Promise<ComputerInfo[]> {
    return [...this.seats.values()]
      .filter((s) => s.info.status !== "destroyed")
      .map((s) => ({ ...s.info }));
  }

  async destroy(id: ComputerId): Promise<void> {
    const seat = this.seats.get(id);
    if (!seat) return;
    await this.cleanupSeat(seat);
    this.usedSlots.delete(seat.slot);
    this.seats.delete(id);
  }

  async exec(id: ComputerId, req: ExecRequest): Promise<ExecResult> {
    const seat = this.need(id);
    this.requireRunning(seat);
    const start = Date.now();
    const r = await sshRun(
      seat.guestIp,
      this.sshKey,
      req.cmd,
      req.timeoutMs ?? 30_000,
      req.cwd,
    );
    return { ...r, durationMs: Date.now() - start };
  }

  async writeFile(id: ComputerId, file: FileWrite): Promise<void> {
    const seat = this.need(id);
    this.requireRunning(seat);
    const path = file.path.startsWith("/")
      ? file.path
      : `/root/${file.path}`;
    const dir = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : ".";
    const b64 =
      typeof file.content === "string"
        ? Buffer.from(file.content, "utf8").toString("base64")
        : Buffer.from(file.content).toString("base64");
    const r = await sshRun(
      seat.guestIp,
      this.sshKey,
      `mkdir -p '${dir}' && echo '${b64}' | base64 -d > '${path}'`,
      30_000,
    );
    if (r.exitCode !== 0) {
      throw new BackendError(this.name, `writeFile failed: ${r.stderr}`);
    }
  }

  async readFile(id: ComputerId, path: string): Promise<FileRead> {
    const seat = this.need(id);
    this.requireRunning(seat);
    const full = path.startsWith("/") ? path : `/root/${path}`;
    const r = await sshRun(seat.guestIp, this.sshKey, `cat '${full}'`, 30_000);
    if (r.exitCode !== 0) throw new FileNotFoundError(full);
    return { path: full, content: r.stdout };
  }

  async listFiles(id: ComputerId, path = "."): Promise<FileEntry[]> {
    const seat = this.need(id);
    this.requireRunning(seat);
    const r = await this.exec(id, {
      cmd: `ls -la ${shellQuote(path)} 2>/dev/null | tail -n +2`,
    });
    if (r.exitCode !== 0) return [];
    const entries: FileEntry[] = [];
    for (const line of r.stdout.split("\n")) {
      const t = line.trim();
      if (!t) continue;
      const parts = t.split(/\s+/);
      if (parts.length < 9) continue;
      const mode = parts[0]!;
      const size = Number(parts[4]) || 0;
      const name = parts.slice(8).join(" ");
      if (name === "." || name === "..") continue;
      entries.push({
        path: name,
        kind: mode.startsWith("d")
          ? "directory"
          : mode.startsWith("-")
            ? "file"
            : "other",
        size,
      });
    }
    return entries;
  }

  private need(id: ComputerId): Seat {
    const s = this.seats.get(id);
    if (!s) throw new ComputerNotFoundError(id);
    return s;
  }

  private requireRunning(seat: Seat): void {
    if (seat.info.status !== "running") {
      throw new ComputerNotRunningError(seat.info.id, seat.info.status);
    }
  }

  private allocSlot(): number {
    for (let i = 0; i < 60; i++) {
      if (!this.usedSlots.has(i)) {
        this.usedSlots.add(i);
        return i;
      }
    }
    throw new BackendError(this.name, "no free firecracker slots (max 60)");
  }

  private async requireFiles(paths: string[]): Promise<void> {
    for (const p of paths) {
      try {
        await access(p, constants.R_OK);
      } catch {
        throw new BackendError(
          this.name,
          `missing asset ${p} — run scripts/build-alpine-rootfs.sh as root on the KVM host`,
        );
      }
    }
  }

  private async setupTap(tap: string, hostIp: string): Promise<void> {
    await run("ip", ["link", "del", tap], true);
    await run("ip", ["tuntap", "add", "dev", tap, "mode", "tap"]);
    await run("sysctl", ["-w", `net.ipv4.conf.${tap}.proxy_arp=1`], true);
    await run("sysctl", ["-w", `net.ipv6.conf.${tap}.disable_ipv6=1`], true);
    await run("ip", ["addr", "add", `${hostIp}/30`, "dev", tap]);
    await run("ip", ["link", "set", "dev", tap, "up"]);
  }

  private async cleanupSeat(seat: Seat): Promise<void> {
    if (seat.proc && !seat.proc.killed) {
      try {
        seat.proc.kill("SIGTERM");
      } catch {
        /* ignore */
      }
      await sleep(200);
      try {
        if (!seat.proc.killed) seat.proc.kill("SIGKILL");
      } catch {
        /* ignore */
      }
    }
    await run("ip", ["link", "del", seat.tap], true);
    await rm(seat.rootfs, { force: true });
    await rm(seat.configPath, { force: true });
    seat.info = {
      ...seat.info,
      status: "destroyed",
      updatedAt: new Date().toISOString(),
    };
  }
}

async function firstExisting(paths: string[]): Promise<string> {
  for (const p of paths) {
    try {
      await access(p, constants.R_OK);
      return p;
    } catch {
      /* next */
    }
  }
  return paths[0]!;
}

/** fast disk clone for seat rootfs */
async function sparseClone(src: string, dest: string): Promise<void> {
  // try reflink (XFS/Btrfs), then sparse, then plain cp
  try {
    await run("cp", ["--reflink=auto", "--sparse=always", "-f", src, dest]);
    return;
  } catch {
    /* fall through */
  }
  try {
    await run("cp", ["--sparse=always", "-f", src, dest]);
    return;
  } catch {
    await run("cp", ["-f", src, dest]);
  }
}

function slotNet(slot: number): {
  tap: string;
  guestIp: string;
  hostIp: string;
} {
  const o = slot * 4;
  if (o + 2 > 254) throw new BackendError("firecracker", "slot out of range");
  return {
    tap: `ld${slot}`,
    guestIp: `169.254.10.${o + 1}`,
    hostIp: `169.254.10.${o + 2}`,
  };
}

function hex2(n: number): string {
  return n.toString(16).padStart(2, "0").slice(-2);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function shellQuote(s: string): string {
  if (/^[a-zA-Z0-9_./-]+$/.test(s)) return s;
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

async function run(
  cmd: string,
  args: string[],
  allowFail = false,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    p.stdout.on("data", (d: Buffer) => {
      out += d.toString();
    });
    p.stderr.on("data", (d: Buffer) => {
      err += d.toString();
    });
    p.on("error", reject);
    p.on("close", (code) => {
      if (code !== 0 && !allowFail) {
        reject(new Error(`${cmd} ${args.join(" ")} failed: ${err || out}`));
      } else resolve(out);
    });
  });
}

async function sshRun(
  ip: string,
  key: string,
  cmd: string,
  timeoutMs: number,
  cwd?: string,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const remote = cwd ? `cd ${shellQuote(cwd)} && ${cmd}` : cmd;
  return new Promise((resolve) => {
    const p = spawn(
      "ssh",
      [
        "-i",
        key,
        "-o",
        "StrictHostKeyChecking=no",
        "-o",
        "UserKnownHostsFile=/dev/null",
        "-o",
        "GlobalKnownHostsFile=/dev/null",
        "-o",
        "BatchMode=yes",
        "-o",
        "ConnectTimeout=2",
        "-o",
        "IPQoS=none",
        // dropbear-friendly
        "-o",
        "PubkeyAcceptedAlgorithms=+ssh-rsa",
        "-o",
        "HostkeyAlgorithms=+ssh-rsa",
        `root@${ip}`,
        remote,
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let stdout = "";
    let stderr = "";
    const t = setTimeout(() => p.kill("SIGKILL"), timeoutMs);
    p.stdout.on("data", (d: Buffer) => {
      stdout += d.toString();
    });
    p.stderr.on("data", (d: Buffer) => {
      stderr += d.toString();
    });
    p.on("close", (code) => {
      clearTimeout(t);
      resolve({ exitCode: code ?? 1, stdout, stderr });
    });
    p.on("error", (e) => {
      clearTimeout(t);
      resolve({ exitCode: 1, stdout: "", stderr: String(e) });
    });
  });
}

async function waitForSsh(
  ip: string,
  key: string,
  timeoutMs: number,
): Promise<void> {
  const start = Date.now();
  let delay = 50;
  while (Date.now() - start < timeoutMs) {
    const r = await sshRun(ip, key, "true", 2500);
    if (r.exitCode === 0) return;
    await sleep(delay);
    delay = Math.min(delay + 50, 200);
  }
  throw new Error(`ssh to ${ip} not ready within ${timeoutMs}ms`);
}

export async function firecrackerAvailable(): Promise<boolean> {
  try {
    await access("/dev/kvm", constants.R_OK);
  } catch {
    return false;
  }
  return new Promise((resolve) => {
    const p = spawn("firecracker", ["--version"], { stdio: "ignore" });
    p.on("error", () => {
      const which = spawn("bash", ["-c", "command -v firecracker"], {
        stdio: ["ignore", "pipe", "ignore"],
      });
      let out = "";
      which.stdout.on("data", (d: Buffer) => {
        out += d.toString();
      });
      which.on("close", (c) => resolve(c === 0 && out.trim().length > 0));
    });
    p.on("close", (c) => resolve(c === 0));
  });
}
