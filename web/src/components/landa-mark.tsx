import { GalleryVerticalEndIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export function LandaMark({
  className,
  size = "md",
}: {
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const dim =
    size === "sm" ? "size-6" : size === "lg" ? "size-10" : "size-8";
  const icon =
    size === "sm" ? "size-3.5" : size === "lg" ? "size-5" : "size-4";
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground",
        dim,
        className,
      )}
      aria-hidden
    >
      <GalleryVerticalEndIcon className={icon} />
    </div>
  );
}
