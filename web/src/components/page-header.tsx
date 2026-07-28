import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

export function PageContainer({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div className={cn("mx-auto w-full max-w-7xl", className)} {...props} />
  )
}

export function PageHeader({
  actions,
  description,
  title,
}: {
  actions?: ReactNode
  description: ReactNode
  title: ReactNode
}) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          {description}
        </p>
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {actions}
        </div>
      ) : null}
    </header>
  )
}
