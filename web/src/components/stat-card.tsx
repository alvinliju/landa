import type { ReactNode } from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  hint,
  icon,
  className,
  mono = true,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  className?: string;
  mono?: boolean;
}) {
  return (
    <Card
      size="sm"
      className={cn(
        "relative overflow-hidden rounded-2xl border-blue-100/80 bg-linear-to-b from-sky-50/40 to-white shadow-sm transition-shadow hover:shadow-md",
        className,
      )}
    >
      <CardHeader className="pb-0">
        <div className="flex items-start justify-between gap-2">
          <CardDescription className="text-[0.7rem] font-medium tracking-wide text-gray-500 uppercase">
            {label}
          </CardDescription>
          {icon ? (
            <div className="flex size-8 items-center justify-center rounded-xl border border-gray-100 bg-white text-gray-500 shadow-xs">
              {icon}
            </div>
          ) : null}
        </div>
        <CardTitle
          className={cn(
            "mt-1 text-lg font-semibold tracking-tight text-gray-900",
            mono && "font-mono text-base",
          )}
        >
          {value}
        </CardTitle>
      </CardHeader>
      {hint ? (
        <CardContent>
          <p className="text-[0.7rem] leading-relaxed text-gray-500">{hint}</p>
        </CardContent>
      ) : null}
    </Card>
  );
}
