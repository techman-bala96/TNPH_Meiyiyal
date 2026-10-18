import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { MessageSquareText, RotateCcw, X } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { initials } from "@/features/profile/useProfile";
import { kmLabel } from "./match";
import { fetchSuggestions, tx } from "./api";
import type { MsgTarget } from "./AutoSearchScreen";

export type NoAnswer = { target: MsgTarget & { spec: string }; node: string; reason: "declined" | "timeout"; at: number };

/** After a manual request is declined or not answered: ask again (after a minute), message them, or try 2–3 people nearby. Non-blocking. */
export function NoAnswerPanel({ n, lat, lng, waitS, onAskAgain, onMessage, onClose }: {
  n: NoAnswer; lat?: number; lng?: number; waitS: number; onAskAgain: () => void; onMessage: () => void; onClose: () => void }) {
  const { t, i18n } = useTranslation(); const lang: "en" | "ta" = i18n.language?.startsWith("ta") ? "ta" : "en";
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(id); }, []);
  const left = Math.max(0, Math.ceil((n.at + waitS * 1000 - now) / 1000));
  const sugg = useQuery({ queryKey: ["suggest", n.node, lat, lng, n.target.id], enabled: lat != null && lng != null, staleTime: 30_000,
    queryFn: () => fetchSuggestions(n.node, lat!, lng!, [n.target.id]) });
  const title = n.reason === "declined" ? t("consult.declined", { name: n.target.display_name }) : t("consult.noAnswer", { name: n.target.display_name });
  return (
    <div data-testid="no-answer-panel" data-reason={n.reason} role="status"
      className="fixed inset-x-3 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-[60] mx-auto max-w-md rounded-3xl border bg-card/95 p-4 shadow-2xl backdrop-blur animate-in slide-in-from-bottom-4 fade-in md:bottom-28">
      <div className="flex items-start gap-3">
        <Avatar className="h-11 w-11">{n.target.photo_url && <AvatarImage src={n.target.photo_url} className="object-cover" />}<AvatarFallback className="bg-primary/10 text-primary">{initials(n.target.display_name)}</AvatarFallback></Avatar>
        <p className="flex-1 pt-0.5 text-sm font-semibold leading-snug">{title}</p>
        <button data-testid="no-answer-close" aria-label={t("nearby.noAnswer.dismiss")} onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button data-testid="ask-again" disabled={left > 0} onClick={onAskAgain}
          className="flex h-11 items-center justify-center gap-1.5 rounded-xl bg-muted text-sm font-semibold transition active:scale-95 disabled:opacity-60">
          <RotateCcw className="h-4 w-4" />{left > 0 ? t("nearby.noAnswer.askAgainIn", { s: left }) : t("nearby.noAnswer.askAgain")}</button>
        <button data-testid="send-message" onClick={onMessage} className="flex h-11 items-center justify-center gap-1.5 rounded-xl bg-primary text-sm font-semibold text-primary-foreground shadow-md transition active:scale-95">
          <MessageSquareText className="h-4 w-4" />{t("nearby.noAnswer.message")}</button>
      </div>
      {(sugg.data?.length ?? 0) > 0 && (
        <div className="mt-3 space-y-1.5" data-testid="suggestions">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t("nearby.noAnswer.others")}</p>
          {sugg.data!.map((w) => (
            <Link key={w.id} to={`/w/${w.id}?connect=1`} onClick={onClose} data-testid="suggestion" data-id={w.id}
              className="flex items-center gap-3 rounded-2xl bg-muted/50 p-2 transition hover:bg-muted">
              <Avatar className="h-9 w-9">{w.photo_url && <AvatarImage src={w.photo_url} className="object-cover" />}<AvatarFallback className="bg-primary/10 text-xs text-primary">{initials(w.display_name)}</AvatarFallback></Avatar>
              <span className="min-w-0 flex-1"><b className="block truncate text-sm">{w.display_name}</b><span className="block truncate text-[11px] text-muted-foreground">{tx(w.specialty, lang)} · {kmLabel(w.distance_km, lang)}</span></span>
              <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">{t("nearby.noAnswer.request")}</span>
            </Link>))}
        </div>)}
    </div>
  );
}
