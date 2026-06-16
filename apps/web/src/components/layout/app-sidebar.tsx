"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CommandSearch } from "@/components/shared/command-search";
import { signOut, useSession } from "@/lib/auth-client";
import { useT } from "@/lib/i18n/provider";
import {
  Activity,
  GitPullRequestArrow,
  FileText,
  Home,
  ListTodo,
  MessageSquare,
  Plus,
  Settings,
  Sparkles,
  ChevronUp,
  LogOut,
  User,
  Archive,
} from "lucide-react";

const navigation = [
  {
    titleKey: "nav.main",
    items: [
      { titleKey: "nav.home", href: "/dashboard", icon: Home },
      { titleKey: "chat.askNexus", href: "/dashboard/chat", icon: MessageSquare },
    ],
  },
  {
    titleKey: "nav.workspace",
    items: [
      { titleKey: "nav.plans", href: "/dashboard/docs", icon: FileText },
      { titleKey: "nav.work", href: "/dashboard/tasks", icon: ListTodo },
      { titleKey: "nav.changes", href: "/dashboard/changes", icon: GitPullRequestArrow },
      { titleKey: "nav.runs", href: "/dashboard/agents", icon: Activity },
    ],
  },
];

export function AppSidebar() {
  const t = useT();
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();
  
  const user = session?.user;
  const userName = user?.name || "User";
  const userEmail = user?.email || "user@example.com";
  const userImage = user?.image || "";
  const userInitials = userName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "U";

  return (
    <Sidebar className="border-r border-border">
      <SidebarHeader className="border-b border-border p-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/dashboard" className="group">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-foreground text-background">
                  <Sparkles className="size-4" />
                </div>
                <div className="flex flex-col gap-0.5 leading-none">
                  <span className="font-semibold text-sm tracking-tight">Nexus</span>
                  <span className="text-[11px] text-muted-foreground">{t("nav.workspace")}</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <div className="mt-2">
          <CommandSearch />
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2">
        {navigation.map((group) => (
          <SidebarGroup key={group.titleKey}>
            <SidebarGroupLabel className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide px-2">
              {t(group.titleKey)}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const isActive = pathname === item.href || 
                    (item.href !== "/dashboard" && pathname.startsWith(item.href));
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        asChild
                        isActive={isActive}
                        className="h-9 transition-base"
                      >
                        <Link href={item.href}>
                          <item.icon className="size-4" />
                          <span className="text-sm">{t(item.titleKey)}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}

        <SidebarGroup>
          <SidebarGroupLabel className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide px-2">
            {t("nav.create")}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild className="h-9 transition-base">
                  <Link href="/dashboard/docs/new">
                    <Plus className="size-4" />
                    <span className="text-sm">{t("docs.newDoc")}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild className="h-9 transition-base">
                  <Link href="/dashboard/tasks/new">
                    <Plus className="size-4" />
                    <span className="text-sm">{t("tasks.newTask")}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup className="mt-auto">
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild className="h-9 transition-base">
                  <Link href="/dashboard/docs/archive">
                    <Archive className="size-4" />
                    <span className="text-sm">{t("common.archive")}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild className="h-9 transition-base">
                  <Link href="/dashboard/settings">
                    <Settings className="size-4" />
                    <span className="text-sm">{t("nav.settings")}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-border p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  className="data-[state=open]:bg-accent transition-base"
                >
                  <Avatar className="size-7">
                    <AvatarImage src={userImage} />
                    <AvatarFallback className="bg-muted text-muted-foreground text-xs font-medium">
                      {userInitials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col gap-0.5 leading-none flex-1 min-w-0">
                    <span className="font-medium text-sm truncate">{userName}</span>
                    <span className="text-[11px] text-muted-foreground truncate">
                      {userEmail}
                    </span>
                  </div>
                  <ChevronUp className="size-4 text-muted-foreground shrink-0" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side="top"
                className="w-[--radix-dropdown-menu-trigger-width]"
              >
                <DropdownMenuItem 
                  onClick={() => router.push("/dashboard/settings?tab=profile")} 
                  className="cursor-pointer"
                >
                  <User className="mr-2 size-4" />
                  {t("common.profile")}
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={() => router.push("/dashboard/settings")} 
                  className="cursor-pointer"
                >
                  <Settings className="mr-2 size-4" />
                  {t("nav.settings")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem 
                  className="text-destructive cursor-pointer"
                  onClick={async () => {
                    await signOut();
                    router.push("/login");
                  }}
                >
                  <LogOut className="mr-2 size-4" />
                  {t("common.signOut")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
