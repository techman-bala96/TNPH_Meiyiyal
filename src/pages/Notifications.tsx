import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { formatDistanceToNow } from "date-fns";
import { enIN, ta } from "date-fns/locale";
import { BadgeCheck, Bell, CheckCheck, IndianRupee, MessageCircle, PhoneCall, ShieldCheck, Star } from "lucide-react";
import { PageShell } from "@/components/app/PageShell";
import { markRead, useInvalidateNotes, useNotifications, type Note } from "@/features/push/api";
import { renderText } from "@/features/push/text";

const ICON: Record<string, typeof Bell> = { requests: PhoneCall, chat: MessageCircle, money: IndianRupee, account: BadgeCheck, admin: ShieldCheck, promos: Star, system: Bell };
const TONE: Record<string, string> = { requests: "bg-emerald-500/15 text-emerald-700", chat: "bg-sky-500/15 text-sky-700", money: "bg-violet-500/15 text-violet-600",
  account: "bg-primary/15 text-primary", admin: "bg-amber-500/15 text-amber-700", promos: "bg-pink-500/15 text-pink-600", system: "bg-muted text-muted-foreground" };

export default function Notifications() {
  const { t, i18n } = useTranslation(); const lang = i18n.language?.startsWith("ta") ? "ta" : "en";
  const q = useNotifications(); const nav = useNavigate(); const refresh = useInvalidateNotes();
  const unread = (q.data ?? []).filter((n) => !n.read_at).length;
  const open = async (n: Note) => { if (!n.read_at) await markRead([n.id]); await refresh(); nav(n.url || "/"); };
  return (
    <PageShell title={t("inbox.title")} testId="inbox-page">
      {unread > 0 && (
        <div className="flex justify-end">
          <button data-testid="inbox-mark-all" onClick={async () => { await markRead(); await refresh(); }} className="tap flex items-center gap-1.5 rounded-xl px-3 text-sm font-medium text-primary">
            <CheckCheck className="h-4 w-4" />{t("inbox.markAll")}</button>
        </div>)}
      {q.isLoading && <div className="h-32 animate-pulse rounded-2xl bg-muted" />}
      {q.data?.length === 0 && (
        <div data-testid="inbox-empty" className="flex flex-col items-center gap-2 py-16 text-center text-sm text-muted-foreground">
          <Bell className="h-10 w-10 opacity-40" />{t("inbox.empty")}</div>)}
      <ul className="space-y-2">
        {q.data?.map((n) => {
          const r = renderText(n, lang); const I = ICON[n.category] ?? Bell;
          return (
            <li key={n.id}>
              <button data-testid="inbox-item" data-kind={n.kind} data-read={!!n.read_at} onClick={() => open(n)}
                className={`card-soft flex w-full items-start gap-3 p-3 text-left transition active:scale-[0.99] ${n.read_at ? "opacity-75" : ""}`}>
                <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${TONE[n.category] ?? TONE.system}`}><I className="h-5 w-5" /></span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-start justify-between gap-2">
                    <span className={`text-sm ${n.read_at ? "font-medium" : "font-semibold"}`}>{r.title}</span>
                    {!n.read_at && <span aria-hidden className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />}
                  </span>
                  <span className="block text-sm text-muted-foreground">{r.body}</span>
                  <span className="mt-0.5 block text-[11px] text-muted-foreground">{formatDistanceToNow(new Date(n.updated_at ?? n.created_at), { addSuffix: true, locale: lang === "ta" ? ta : enIN })}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </PageShell>
  );
}
