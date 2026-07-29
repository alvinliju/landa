import { GalleryVerticalEndIcon } from "lucide-react";

import { LoginForm } from "@/components/login-form";

/** shadcn login-03 layout: muted canvas, brand mark, centered card */
export function SignInPage({
  onAuthed,
}: {
  onAuthed: () => void | Promise<void>;
}) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <a
          href="/"
          className="flex items-center gap-2 self-center font-medium"
          onClick={(e) => e.preventDefault()}
        >
          <div className="flex size-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <GalleryVerticalEndIcon className="size-4" />
          </div>
          landa
        </a>
        <LoginForm onAuthed={onAuthed} />
      </div>
    </div>
  );
}
