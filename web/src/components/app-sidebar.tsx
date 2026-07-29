import {
  BoxesIcon,
  LayoutDashboardIcon,
  SettingsIcon,
  TerminalSquareIcon,
} from "lucide-react";

import {
  AppSidebarHeader,
  AppSidebarShell,
} from "@/components/app-sidebar-shell";
import { LandaMark } from "@/components/landa-mark";
import { ThemeDropdown } from "@/components/theme-dropdown";
import {
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import type { LandaPage } from "@/lib/navigation";

const nav = [
  { id: "overview" as const, title: "Overview", icon: LayoutDashboardIcon },
  { id: "sandboxes" as const, title: "Sandboxes", icon: TerminalSquareIcon },
  { id: "templates" as const, title: "Templates", icon: BoxesIcon },
  { id: "settings" as const, title: "Settings", icon: SettingsIcon },
];

export function AppSidebar({
  page,
  navigate,
  projectSlug,
  ...props
}: React.ComponentProps<typeof AppSidebarShell> & {
  page: LandaPage;
  navigate: (page: Exclude<LandaPage, "sandbox">) => void;
  projectSlug?: string;
}) {
  return (
    <AppSidebarShell {...props}>
      <AppSidebarHeader>
        <div className="flex min-w-0 items-center gap-2.5 px-0.5">
          <LandaMark size="sm" />
          <div className="min-w-0 leading-none">
            <div className="truncate text-sm font-semibold tracking-tight">
              landa
            </div>
            <div className="mt-0.5 truncate font-mono text-[0.625rem] text-muted-foreground">
              {projectSlug ? projectSlug : "console"}
            </div>
          </div>
        </div>
      </AppSidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-[0.65rem] tracking-[0.08em] uppercase">
            Console
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {nav.map((item) => {
                const active =
                  page === item.id ||
                  (item.id === "sandboxes" && page === "sandbox");
                return (
                  <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton
                      isActive={active}
                      onClick={() => navigate(item.id)}
                      className="h-8 rounded-lg"
                    >
                      <item.icon />
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarSeparator />
      <SidebarFooter className="gap-2">
        <div className="rounded-lg bg-muted/50 px-2.5 py-2 ring-1 ring-border/50">
          <div className="text-[0.65rem] font-medium tracking-wide text-muted-foreground uppercase">
            Free tier
          </div>
          <div className="mt-0.5 text-xs text-foreground/90">
            8h seat TTL · concurrent limits
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 px-0.5">
          <span className="truncate text-[0.65rem] text-muted-foreground">
            Theme
          </span>
          <ThemeDropdown />
        </div>
      </SidebarFooter>
    </AppSidebarShell>
  );
}
