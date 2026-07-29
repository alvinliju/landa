import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

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
        if (error) throw new Error(error.message || "sign up failed");
        toast.success("account created");
      } else {
        const { error } = await authClient.signIn.email({
          email: email.trim(),
          password,
        });
        if (error) throw new Error(error.message || "sign in failed");
        toast.success("signed in");
      }
      onAuthed();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "auth failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-background p-6">
      <Card className="w-full max-w-md ring-1 ring-foreground/10">
        <CardHeader>
          <CardTitle className="font-mono text-lg">landa</CardTitle>
          <CardDescription>
            computers for agents — free to use. Sign in to open the console.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-4" onSubmit={submit}>
            {mode === "signup" ? (
              <div className="grid gap-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="you"
                  autoComplete="name"
                />
              </div>
            ) : null}
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="min 8 characters"
                autoComplete={
                  mode === "signup" ? "new-password" : "current-password"
                }
              />
            </div>
            <Button type="submit" disabled={loading || !email || !password}>
              {loading
                ? "…"
                : mode === "signup"
                  ? "create free account"
                  : "sign in"}
            </Button>
            <button
              type="button"
              className="text-center text-xs text-muted-foreground underline-offset-2 hover:underline"
              onClick={() =>
                setMode((m) => (m === "signin" ? "signup" : "signin"))
              }
            >
              {mode === "signin"
                ? "need an account? sign up"
                : "already have an account? sign in"}
            </button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
