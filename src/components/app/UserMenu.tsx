import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { LogOut, Settings, ShieldCheck } from "lucide-react";
import { useIsAdmin } from "@/features/worker/api";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/useAuth";
import { initials, useProfile } from "@/features/profile/useProfile";

export function UserAvatar({ className = "h-9 w-9" }: { className?: string }) {
  const { user } = useAuth(); const { data: p } = useProfile();
  return (
    <Avatar className={className}>
      {p?.avatar_url && <AvatarImage src={p.avatar_url} alt="" className="object-cover" />}
      <AvatarFallback className="bg-primary/15 text-sm font-semibold text-primary">{initials(p?.full_name, user?.email || user?.phone)}</AvatarFallback>
    </Avatar>
  );
}

export function UserMenu() {
  const { t } = useTranslation(); const nav = useNavigate();
  const { user, signOut } = useAuth(); const { data: p } = useProfile(); const admin = useIsAdmin();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger data-testid="avatar-btn" aria-label={t("menu.account")} className="tap grid w-11 shrink-0 place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <UserAvatar />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 rounded-xl">
        <DropdownMenuLabel className="font-normal">
          <p className="truncate text-sm font-semibold">{p?.full_name || t("menu.noName")}</p>
          <p data-testid="signed-in-as" className="truncate text-xs text-muted-foreground">{user?.email || user?.phone}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem data-testid="menu-settings" className="min-h-10 gap-2" onSelect={() => nav("/settings")}><Settings className="h-4 w-4" />{t("menu.settings")}</DropdownMenuItem>
        {admin.data && <DropdownMenuItem data-testid="menu-admin" className="min-h-10 gap-2" onSelect={() => nav("/admin")}><ShieldCheck className="h-4 w-4" />{t("menu2.admin")}</DropdownMenuItem>}
        <DropdownMenuSeparator />
        <DropdownMenuItem data-testid="btn-signout" className="min-h-10 gap-2 text-destructive focus:text-destructive" onSelect={() => signOut()}><LogOut className="h-4 w-4" />{t("auth.signOut")}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
