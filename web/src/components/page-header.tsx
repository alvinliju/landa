import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function PageContainer({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "mx-auto w-full max-w-6xl animate-in-fade px-5 py-8 sm:px-8",
        className,
      )}
      {...props}
    />
  );
}

export function PageHeader({
  actions,
  description,
  title,
  eyebrow,
}: {
  actions?: ReactNode;
  description: ReactNode;
  title: ReactNode;
  eyebrow?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 space-y-1.5">
        {eyebrow ? (
          <div className="text-[0.7rem] font-medium tracking-[0.1em] text-sky-600/80 uppercase">
            {eyebrow}
          </div>
        ) : null}
        <h1 className="text-[1.625rem] leading-tight font-semibold tracking-tight text-balance">
          {title}
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground text-pretty">
          {description}
        </p>
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {actions}
        </div>
      ) : null}
    </header>
  );
}
