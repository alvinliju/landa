import * as React from "react";
import { LoaderCircle, Lock, LogIn, Mail, User } from "lucide-react";

import { cn } from "@/lib/utils";

export type CleanSignInProps = {
  /** Auth handler — sign in or sign up depending on mode */
  onSubmit: (input: {
    mode: "signin" | "signup";
    email: string;
    password: string;
    name?: string;
  }) => Promise<void>;
  className?: string;
};

/**
 * Clean minimal email sign-in card (sky wash, soft shadow, gray gradient CTA).
 * Wired for landa Better Auth — not a demo alert.
 */
export function SignIn2({ onSubmit, className }: CleanSignInProps) {
  const [mode, setMode] = React.useState<"signin" | "signup">("signin");
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  const validateEmail = (value: string) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

  async function handleSignIn(e?: React.FormEvent) {
    e?.preventDefault();
    if (!email || !password) {
      setError("Please enter both email and password.");
      return;
    }
    if (!validateEmail(email)) {
      setError("Please enter a valid email address.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await onSubmit({
        mode,
        email: email.trim(),
        password,
        name: name.trim() || undefined,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
      setLoading(false);
    }
  }

  return (
    <div
      className={cn(
        "z-1 flex min-h-svh w-full items-center justify-center bg-white",
        className,
      )}
    >
      {/* soft ambient wash */}
      <div
        className="pointer-events-none absolute inset-0 bg-linear-to-b from-sky-50 via-white to-white"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          backgroundImage:
            "radial-gradient(ellipse 70% 50% at 50% -10%, rgba(186,230,253,0.55), transparent 55%)",
        }}
        aria-hidden
      />

      <div className="relative z-10 w-full max-w-sm rounded-3xl border border-blue-100 bg-linear-to-b from-sky-50/50 to-white p-8 text-black shadow-xl shadow-sky-100/80 flex flex-col items-center">
        <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-lg shadow-sky-100/60">
          <LogIn className="h-7 w-7 text-black" />
        </div>

        <h2 className="mb-2 text-center text-2xl font-semibold tracking-tight">
          {mode === "signin" ? "Sign in with email" : "Create your account"}
        </h2>
        <p className="mb-6 text-center text-sm text-gray-500 text-balance">
          {mode === "signin"
            ? "Open your free landa console — agent computers in seconds."
            : "Free forever for this public build. No card, no invite."}
        </p>

        {/* mode tabs */}
        <div className="mb-4 grid w-full grid-cols-2 gap-1 rounded-xl bg-gray-100 p-1">
          {(
            [
              ["signin", "Sign in"],
              ["signup", "Sign up"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setMode(id);
                setError("");
              }}
              className={cn(
                "rounded-lg py-1.5 text-sm font-medium transition",
                mode === id
                  ? "bg-white text-black shadow-sm"
                  : "text-gray-500 hover:text-gray-800",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <form className="mb-2 flex w-full flex-col gap-3" onSubmit={handleSignIn}>
          {mode === "signup" ? (
            <div className="relative">
              <span className="absolute top-1/2 left-3 -translate-y-1/2 text-gray-400">
                <User className="h-4 w-4" />
              </span>
              <input
                placeholder="Name"
                type="text"
                value={name}
                autoComplete="name"
                className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pr-3 pl-10 text-sm text-black focus:ring-2 focus:ring-blue-200 focus:outline-none"
                onChange={(e) => setName(e.target.value)}
              />
            </div>
          ) : null}

          <div className="relative">
            <span className="absolute top-1/2 left-3 -translate-y-1/2 text-gray-400">
              <Mail className="h-4 w-4" />
            </span>
            <input
              placeholder="Email"
              type="email"
              value={email}
              autoComplete="email"
              className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pr-3 pl-10 text-sm text-black focus:ring-2 focus:ring-blue-200 focus:outline-none"
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="relative">
            <span className="absolute top-1/2 left-3 -translate-y-1/2 text-gray-400">
              <Lock className="h-4 w-4" />
            </span>
            <input
              placeholder="Password"
              type="password"
              value={password}
              autoComplete={
                mode === "signup" ? "new-password" : "current-password"
              }
              className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pr-3 pl-10 text-sm text-black focus:ring-2 focus:ring-blue-200 focus:outline-none"
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <div className="flex w-full items-start justify-between gap-2">
            {error ? (
              <div className="text-left text-sm text-red-500">{error}</div>
            ) : (
              <span />
            )}
            {mode === "signin" ? (
              <span className="shrink-0 text-xs font-medium text-gray-400">
                Free tier · 8h TTL
              </span>
            ) : null}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-2 mb-2 flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-linear-to-b from-gray-700 to-gray-900 py-2.5 font-medium text-white shadow transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {loading ? (
              <>
                <LoaderCircle className="h-4 w-4 animate-spin" />
                {mode === "signup" ? "Creating…" : "Signing in…"}
              </>
            ) : mode === "signup" ? (
              "Create free account"
            ) : (
              "Get Started"
            )}
          </button>
        </form>

        <div className="my-2 flex w-full items-center">
          <div className="flex-grow border-t border-dashed border-gray-200" />
          <span className="mx-2 text-xs text-gray-400">computers for agents</span>
          <div className="flex-grow border-t border-dashed border-gray-200" />
        </div>

        <p className="mt-3 text-center text-xs text-gray-400">
          Email & password only for now — social providers coming later.
        </p>
      </div>
    </div>
  );
}

export { SignIn2 as CleanMinimalSignIn };
