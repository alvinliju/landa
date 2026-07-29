import { ChevronRightIcon, LogOutIcon, UserIcon } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

export type SidebarUserInfo = {
  email?: string | null;
  name?: string | null;
  id?: string | null;
};

function initials(user: SidebarUserInfo): string {
  const base = (user.name || user.email || "?").trim();
  const parts = base.split(/[\s@._-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  }
  return base.slice(0, 2).toUpperCase() || "?";
}

export function SidebarProfile({
  user,
  projectSlug,
  onOpenSettings,
  onSignOut,
}: {
  user: SidebarUserInfo;
  projectSlug?: string;
  onOpenSettings: () => void;
  onSignOut: () => void;
}) {
  const label = user.name?.trim() || user.email || "Account";
  const sub = user.email && user.name ? user.email : projectSlug || "Free tier";

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                size="lg"
                className="h-auto min-h-11 data-open:bg-sidebar-accent"
                tooltip={label}
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted font-mono text-[0.7rem] font-medium">
                  {initials(user)}
                </span>
                <span className="grid min-w-0 flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{label}</span>
                  <span className="truncate text-[0.65rem] text-muted-foreground">
                    {sub}
                  </span>
                </span>
                <ChevronRightIcon className="ml-auto size-3.5 opacity-50" />
              </SidebarMenuButton>
            }
          />
          <DropdownMenuContent side="top" align="start" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium">{label}</span>
                {user.email ? (
                  <span className="truncate font-mono text-[0.65rem] text-muted-foreground">
                    {user.email}
                  </span>
                ) : null}
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onOpenSettings}>
              <UserIcon />
              Profile & settings
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={onSignOut}
              className="text-destructive focus:text-destructive"
            >
              <LogOutIcon />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
