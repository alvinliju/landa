import { toast } from "sonner";

import { SignIn2 } from "@/components/ui/clean-minimal-sign-in";
import { authClient } from "@/lib/auth-client";

export function SignInPage({
  onAuthed,
}: {
  /** Opens the console after cookies are set. May throw. */
  onAuthed: () => void | Promise<void>;
}) {
  return (
    <SignIn2
      onSubmit={async ({ mode, email, password, name }) => {
        if (mode === "signup") {
          const { error } = await authClient.signUp.email({
            name: name || email.split("@")[0] || "User",
            email,
            password,
          });
          if (error) throw new Error(error.message || "Could not create account");
        } else {
          const { error } = await authClient.signIn.email({ email, password });
          if (error) throw new Error(error.message || "Could not sign in");
        }
        await onAuthed();
        toast.success(mode === "signup" ? "Account created" : "Welcome back");
      }}
    />
  );
}
