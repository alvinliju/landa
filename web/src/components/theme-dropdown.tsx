import { CheckIcon, LaptopIcon, MoonIcon, SunIcon } from "lucide-react"

import { useTheme } from "@/components/theme-provider"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

const themes = [
  { value: "light" as const, label: "Light", icon: SunIcon },
  { value: "dark" as const, label: "Dark", icon: MoonIcon },
  { value: "system" as const, label: "System", icon: LaptopIcon },
]

export function ThemeDropdown() {
  const { theme, setTheme } = useTheme()
  const activeTheme =
    themes.find((option) => option.value === theme) ?? themes[2]
  const ActiveIcon = activeTheme.icon

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton tooltip="Theme">
                <ActiveIcon />
                <span>Theme</span>
                <span className="ml-auto text-xs text-sidebar-foreground/60">
                  {activeTheme.label}
                </span>
              </SidebarMenuButton>
            }
          />
          <DropdownMenuContent align="start" className="w-56" side="top">
            {themes.map((option) => {
              const Icon = option.icon
              return (
                <DropdownMenuItem
                  key={option.value}
                  onClick={() => setTheme(option.value)}
                >
                  <Icon />
                  {option.label}
                  {theme === option.value ? (
                    <CheckIcon className="ml-auto" />
                  ) : null}
                </DropdownMenuItem>
              )
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
