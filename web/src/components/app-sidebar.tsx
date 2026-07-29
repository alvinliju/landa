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
import {
  SidebarProfile,
  type SidebarUserInfo,
} from "@/components/sidebar-user";
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
  { id: "sandboxes" as const, title: "VMs", icon: TerminalSquareIcon },
  { id: "templates" as const, title: "Templates", icon: BoxesIcon },
  { id: "settings" as const, title: "Settings", icon: SettingsIcon },
];

export function AppSidebar({
  page,
  navigate,
  projectSlug,
  user,
  onSignOut,
  ...props
}: React.ComponentProps<typeof AppSidebarShell> & {
  page: LandaPage;
  navigate: (page: Exclude<LandaPage, "sandbox">) => void;
  projectSlug?: string;
  user?: SidebarUserInfo;
  onSignOut: () => void;
}) {
  return (
    <AppSidebarShell {...props}>
      <AppSidebarHeader>
        <div className="flex min-w-0 items-center gap-2 px-0.5">
          <LandaMark size="sm" />
          <div className="min-w-0 leading-none">
            <div className="truncate text-sm font-medium">landa</div>
            <div className="mt-0.5 truncate font-mono text-[0.625rem] text-muted-foreground">
              {projectSlug ?? "console"}
            </div>
          </div>
        </div>
      </AppSidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Console</SidebarGroupLabel>
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
      <SidebarFooter className="gap-1">
        <SidebarSeparator className="mx-0" />
        <ThemeDropdown />
        <SidebarProfile
          user={user ?? {}}
          projectSlug={projectSlug}
          onOpenSettings={() => navigate("settings")}
          onSignOut={onSignOut}
        />
      </SidebarFooter>
    </AppSidebarShell>
  );
}
