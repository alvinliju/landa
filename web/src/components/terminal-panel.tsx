import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function TerminalPanel({
  title = "exec",
  meta,
  children,
  className,
  footer,
}: {
  title?: string;
  meta?: ReactNode;
  children: ReactNode;
  className?: string;
  footer?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border bg-zinc-950 text-zinc-100",
        className,
      )}
    >
      <div className="flex items-center gap-3 border-b border-white/10 px-3 py-2">
        <div className="flex items-center gap-1.5" aria-hidden>
          <span className="size-2 rounded-full bg-red-500/80" />
          <span className="size-2 rounded-full bg-amber-400/80" />
          <span className="size-2 rounded-full bg-emerald-500/80" />
        </div>
        <div className="min-w-0 flex-1 truncate font-mono text-[0.65rem] text-white/40">
          {title}
        </div>
        {meta ? (
          <div className="shrink-0 font-mono text-[0.65rem] text-white/40">
            {meta}
          </div>
        ) : null}
      </div>
      <div className="min-h-0">{children}</div>
      {footer ? (
        <div className="border-t border-white/10 px-3 py-2">{footer}</div>
      ) : null}
    </div>
  );
}
