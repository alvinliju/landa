export type Session = {
  id: string;
  name: string;
  status: string;
  repoUrl: string | null;
  computerId: string | null;
  guestIp: string | null;
  sshHint: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  lastAttachAt: string | null;
  hasVolume?: boolean;
  editMode?: string;
  filesVia?: string;
  workspace?: string;
};

export type ExecResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs?: number;
};

export class LandaClient {
  constructor(
    public base: string,
    public apiKey: string,
  ) {}

  private async req<T>(
    path: string,
    init: RequestInit = {},
  ): Promise<T> {
    const res = await fetch(`${this.base}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(init.headers as Record<string, string>),
      },
    });
    const data = (await res.json().catch(() => ({}))) as T & {
      error?: string;
      message?: string;
    };
    if (!res.ok) {
      const msg =
        data.message || data.error || `${res.status} ${res.statusText}`;
      const err = new Error(msg) as Error & { status: number; body: unknown };
      err.status = res.status;
      err.body = data;
      throw err;
    }
    return data;
  }

  me() {
    return this.req<{
      user?: { email?: string; id?: string };
      project?: { slug?: string };
      via?: string;
    }>("/v1/me");
  }

  sessions() {
    return this.req<{ sessions: Session[]; editMode?: string }>(
      "/v1/sessions",
    );
  }

  session(id: string) {
    return this.req<{ session: Session; hint?: string }>(
      `/v1/sessions/${id}`,
    );
  }

  createSession(body: { name?: string; repo?: string; boot?: boolean }) {
    return this.req<{ session: Session; hint?: string }>("/v1/sessions", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  startSession(id: string) {
    return this.req<{ ok: boolean; status: string }>(
      `/v1/sessions/${id}/start`,
      { method: "POST" },
    );
  }

  stopSession(id: string) {
    return this.req<{ ok: boolean; status: string }>(
      `/v1/sessions/${id}/stop`,
      { method: "POST" },
    );
  }

  destroySession(id: string) {
    return this.req<{ ok: boolean }>(`/v1/sessions/${id}`, {
      method: "DELETE",
    });
  }

  exec(id: string, cmd: string) {
    return this.req<{ result: ExecResult }>(`/v1/sessions/${id}/exec`, {
      method: "POST",
      body: JSON.stringify({ cmd }),
    });
  }

  writeFile(id: string, path: string, content: string) {
    return this.req<{ ok: boolean; path: string; via?: string }>(
      `/v1/sessions/${id}/files`,
      {
        method: "POST",
        body: JSON.stringify({ path, content }),
      },
    );
  }

  readFile(id: string, path: string) {
    return this.req<{
      file: { path: string; content: string };
      via?: string;
    }>(
      `/v1/sessions/${id}/files?path=${encodeURIComponent(path)}&mode=read`,
    );
  }

  listFiles(id: string, path = "/workspace") {
    return this.req<{
      entries: { path: string; kind?: string; size?: number }[];
      via?: string;
    }>(
      `/v1/sessions/${id}/files?path=${encodeURIComponent(path)}&mode=list`,
    );
  }

  /** Resolve session by UUID or unique name. */
  async resolveSession(idOrName: string): Promise<Session> {
    const looksUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        idOrName,
      );
    if (looksUuid) {
      const { session } = await this.session(idOrName);
      return session;
    }
    const { sessions } = await this.sessions();
    const matches = sessions.filter(
      (s) => s.name === idOrName || s.name.startsWith(idOrName),
    );
    if (matches.length === 1) return matches[0]!;
    if (matches.length === 0) {
      throw new Error(`no session named "${idOrName}"`);
    }
    throw new Error(
      `ambiguous name "${idOrName}": ${matches.map((m) => m.name).join(", ")}`,
    );
  }
}
