import { cn } from "@/lib/utils";

/** Compact monogram — white tile + charcoal glyph (clean minimal). */
export function LandaMark({
  className,
  size = "md",
}: {
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const dim =
    size === "sm" ? "size-7" : size === "lg" ? "size-11" : "size-8";
  return (
    <div
      className={cn(
        "relative flex shrink-0 items-center justify-center rounded-2xl border border-gray-100 bg-white text-gray-900 shadow-sm",
        dim,
        className,
      )}
      aria-hidden
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        className={
          size === "sm" ? "size-3.5" : size === "lg" ? "size-5" : "size-4"
        }
      >
        <rect
          x="4"
          y="5"
          width="16"
          height="11"
          rx="2"
          stroke="currentColor"
          strokeWidth="1.75"
        />
        <path
          d="M8 19h8"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
        />
        <path
          d="M12 16v3"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
        />
        <circle cx="9" cy="10.5" r="1" fill="currentColor" />
        <circle cx="12" cy="10.5" r="1" fill="currentColor" />
        <circle cx="15" cy="10.5" r="1" fill="currentColor" />
      </svg>
    </div>
  );
}

export function LandaWordmark({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <LandaMark size="sm" />
      <div className="min-w-0 leading-none">
        <div className="text-[0.9375rem] font-semibold tracking-tight">
          landa
        </div>
        <div className="mt-0.5 text-[0.65rem] text-muted-foreground">
          computers for agents
        </div>
      </div>
    </div>
  );
}
