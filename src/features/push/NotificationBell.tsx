import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Bell } from "lucide-react";
import { useUnreadCount } from "./api";

export function NotificationBell() {
  const { t } = useTranslation(); const { data: n = 0 } = useUnreadCount();
  return (
    <Link to="/notifications" data-testid="bell" data-unread={n} aria-label={n ? `${t("inbox.bell")} · ${t("inbox.unread", { count: n })}` : t("inbox.bell")}
      className="tap relative grid w-11 shrink-0 place-items-center rounded-full">
      <Bell className="h-5 w-5" />
      {n > 0 && <span data-testid="bell-count" className="absolute right-1 top-1.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white animate-in zoom-in">{n > 99 ? "99+" : n}</span>}
    </Link>
  );
}
