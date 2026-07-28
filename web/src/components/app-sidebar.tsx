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
} from "@/components/ui/sidebar";
import type { LandaPage } from "@/lib/navigation";
import { pagePaths } from "@/lib/navigation";

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
        <div className="flex min-w-0 flex-col gap-0.5 px-1">
          <span className="truncate font-mono text-sm font-semibold tracking-tight">
            landa
          </span>
          <span className="truncate text-[0.65rem] text-muted-foreground">
            {projectSlug ? `project · ${projectSlug}` : "computers for agents"}
          </span>
        </div>
      </AppSidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Console</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {nav.map((item) => (
                <SidebarMenuItem key={item.id}>
                  <SidebarMenuButton
                    isActive={
                      page === item.id ||
                      (item.id === "sandboxes" && page === "sandbox")
                    }
                    onClick={() => navigate(item.id)}
                  >
                    <item.icon />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <div className="flex items-center justify-between gap-2 px-1">
          <span className="truncate font-mono text-[0.65rem] text-muted-foreground">
            {pagePaths[page === "sandbox" ? "sandboxes" : page]}
          </span>
          <ThemeDropdown />
        </div>
      </SidebarFooter>
    </AppSidebarShell>
  );
}
