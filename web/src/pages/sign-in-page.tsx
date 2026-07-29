import * as React from "react";
import { ArrowRightIcon, LoaderCircleIcon, ShieldCheckIcon } from "lucide-react";
import { toast } from "sonner";

import { LandaMark } from "@/components/landa-mark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

const features = [
  {
    title: "Ephemeral seats",
    body: "Spin up agent computers in seconds. 8-hour TTL, reaped cleanly.",
  },
  {
    title: "Exec & snapshot",
    body: "Run commands, inspect world state, tear down when the job is done.",
  },
  {
    title: "Free while building",
    body: "Email sign-in only. No card, no invite code, no waitlist.",
  },
];

export function SignInPage({ onAuthed }: { onAuthed: () => void }) {
  const [mode, setMode] = React.useState<"signin" | "signup">("signin");
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await authClient.signUp.email({
          name: name.trim() || email.split("@")[0] || "User",
          email: email.trim(),
          password,
        });
        if (error) throw new Error(error.message || "Could not create account");
        toast.success("Account created");
      } else {
        const { error } = await authClient.signIn.email({
          email: email.trim(),
          password,
        });
        if (error) throw new Error(error.message || "Could not sign in");
        toast.success("Welcome back");
      }
      onAuthed();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="surface-mesh relative flex min-h-svh">
      <div className="grid-fade pointer-events-none absolute inset-0 opacity-60" />

      {/* Brand panel */}
      <aside className="relative hidden w-[46%] flex-col justify-between overflow-hidden border-r border-border/60 p-10 lg:flex xl:w-[48%] xl:p-14">
        <div className="animate-in-up relative z-10 flex items-center gap-3">
          <LandaMark size="md" />
          <div>
            <div className="text-sm font-semibold tracking-tight">landa</div>
            <div className="text-xs text-muted-foreground">
              control plane
            </div>
          </div>
        </div>

        <div className="relative z-10 max-w-md animate-in-up stagger-1">
          <p className="mb-3 text-[0.7rem] font-medium tracking-[0.12em] text-primary uppercase">
            Computers for agents
          </p>
          <h1 className="text-[2.15rem] leading-[1.15] font-semibold tracking-tight text-balance xl:text-[2.4rem]">
            A seat for every agent job — create, exec, destroy.
          </h1>
          <p className="mt-4 text-[0.9375rem] leading-relaxed text-muted-foreground text-pretty">
            landa gives agents real machines: Firecracker seats with offline
            toolchains, memory backends for smoke tests, and a clean API surface
            you can script against.
          </p>

          <ul className="mt-10 space-y-5">
            {features.map((f, i) => (
              <li
                key={f.title}
                className={cn(
                  "animate-in-up flex gap-3",
                  i === 0 && "stagger-2",
                  i === 1 && "stagger-3",
                  i === 2 && "stagger-4",
                )}
              >
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary shadow-[0_0_12px_var(--primary)]" />
                <div>
                  <div className="text-sm font-medium tracking-tight">
                    {f.title}
                  </div>
                  <div className="mt-0.5 text-sm leading-relaxed text-muted-foreground">
                    {f.body}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative z-10 flex items-center gap-2 text-xs text-muted-foreground">
          <ShieldCheckIcon className="size-3.5 text-primary/80" />
          Session cookies · same-origin · free tier
        </div>

        {/* Soft floating card accent */}
        <div
          className="pointer-events-none absolute right-[-10%] bottom-[18%] hidden w-[280px] rotate-[-6deg] rounded-2xl border border-white/8 bg-card/70 p-4 shadow-lg backdrop-blur-md xl:block"
          aria-hidden
        >
          <div className="mb-3 flex items-center gap-2 font-mono text-[0.65rem] text-muted-foreground">
            <span className="pulse-dot size-1.5 rounded-full bg-success" />
            seat · running
          </div>
          <pre className="font-mono text-[0.7rem] leading-relaxed text-foreground/80">
            {`$ landa exec uname -a\nLinux landa 6.1 …\nexit 0 · 42ms`}
          </pre>
        </div>
      </aside>

      {/* Form panel */}
      <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-5 py-12 sm:px-8">
        <div className="mb-8 flex w-full max-w-[400px] items-center gap-2.5 lg:hidden">
          <LandaMark size="sm" />
          <span className="text-sm font-semibold tracking-tight">landa</span>
        </div>

        <div className="w-full max-w-[400px] animate-in-up">
          <div className="mb-7">
            <h2 className="text-xl font-semibold tracking-tight">
              {mode === "signin" ? "Sign in" : "Create your account"}
            </h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {mode === "signin"
                ? "Open the console with your email and password."
                : "Free forever for this public build. Takes under a minute."}
            </p>
          </div>

          {/* Mode switch */}
          <div
            className="mb-6 grid grid-cols-2 rounded-lg bg-muted/80 p-1 ring-1 ring-border/60"
            role="tablist"
          >
            {(
              [
                ["signin", "Sign in"],
                ["signup", "Sign up"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={mode === id}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-all",
                  mode === id
                    ? "bg-card text-foreground shadow-sm ring-1 ring-border/70"
                    : "text-muted-foreground hover:text-foreground",
                )}
                onClick={() => setMode(id)}
              >
                {label}
              </button>
            ))}
          </div>

          <form className="flex flex-col gap-4" onSubmit={submit}>
            {mode === "signup" ? (
              <div className="grid gap-2">
                <Label htmlFor="name" className="text-xs font-medium">
                  Name
                </Label>
                <Input
                  id="name"
                  className="h-9 rounded-lg px-3 text-sm"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ada Lovelace"
                  autoComplete="name"
                />
              </div>
            ) : null}
            <div className="grid gap-2">
              <Label htmlFor="email" className="text-xs font-medium">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                required
                className="h-9 rounded-lg px-3 text-sm"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                autoComplete="email"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password" className="text-xs font-medium">
                Password
              </Label>
              <Input
                id="password"
                type="password"
                required
                minLength={8}
                className="h-9 rounded-lg px-3 text-sm"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                autoComplete={
                  mode === "signup" ? "new-password" : "current-password"
                }
              />
            </div>

            <Button
              type="submit"
              size="lg"
              disabled={loading || !email || !password}
              className="mt-1 h-10 rounded-lg text-sm shadow-sm"
            >
              {loading ? (
                <>
                  <LoaderCircleIcon className="animate-spin" />
                  {mode === "signup" ? "Creating account…" : "Signing in…"}
                </>
              ) : (
                <>
                  {mode === "signup" ? "Create free account" : "Continue"}
                  <ArrowRightIcon data-icon="inline-end" />
                </>
              )}
            </Button>
          </form>

          <p className="mt-6 text-center text-xs leading-relaxed text-muted-foreground">
            By continuing you get a free project with concurrent seats and an
            8-hour sandbox TTL.
          </p>
        </div>
      </main>
    </div>
  );
}
