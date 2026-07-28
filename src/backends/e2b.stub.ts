import type {
  ComputerBackend,
  ComputerId,
  ComputerInfo,
  ComputerSpec,
  ExecRequest,
  ExecResult,
  FileRead,
  FileWrite,
} from "../types.js";

/**
 * Placeholder for E2B driver.
 * Install `@e2b/code-interpreter` or `e2b` and implement against their SDK.
 * @see https://github.com/e2b-dev/E2B
 */
export class E2BBackend implements ComputerBackend {
  readonly name = "e2b";

  constructor(private readonly apiKey: string = process.env.E2B_API_KEY ?? "") {
    if (!this.apiKey) {
      // allow construct; methods throw until key + SDK wired
    }
  }

  async create(_spec: ComputerSpec): Promise<ComputerInfo> {
    throw new Error(
      "E2B backend not wired yet. npm i e2b && implement create() — see docs/backends.md",
    );
  }

  async get(_id: ComputerId): Promise<ComputerInfo | null> {
    throw new Error("E2B backend not wired yet");
  }

  async list(): Promise<ComputerInfo[]> {
    throw new Error("E2B backend not wired yet");
  }

  async destroy(_id: ComputerId): Promise<void> {
    throw new Error("E2B backend not wired yet");
  }

  async exec(_id: ComputerId, _req: ExecRequest): Promise<ExecResult> {
    throw new Error("E2B backend not wired yet");
  }

  async writeFile(_id: ComputerId, _file: FileWrite): Promise<void> {
    throw new Error("E2B backend not wired yet");
  }

  async readFile(_id: ComputerId, _path: string): Promise<FileRead> {
    throw new Error("E2B backend not wired yet");
  }
}
