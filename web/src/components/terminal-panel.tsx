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
        "overflow-hidden rounded-2xl border border-gray-200 bg-[#0f1419] shadow-md",
        className,
      )}
    >
      <div className="flex items-center gap-3 border-b border-white/8 bg-white/3 px-3.5 py-2.5">
        <div className="flex items-center gap-1.5" aria-hidden>
          <span className="size-2 rounded-full bg-[#ff5f57]" />
          <span className="size-2 rounded-full bg-[#febc2e]" />
          <span className="size-2 rounded-full bg-[#28c840]" />
        </div>
        <div className="min-w-0 flex-1 truncate font-mono text-[0.65rem] text-white/45">
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
        <div className="border-t border-white/8 bg-white/3 px-3 py-2.5">
          {footer}
        </div>
      ) : null}
    </div>
  );
}
