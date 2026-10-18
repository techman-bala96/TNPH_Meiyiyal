import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, MapPin, MessageSquareText, Radar, RefreshCw, Globe2, X } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { initials } from "@/features/profile/useProfile";
import { kmLabel } from "./match";
import { tx, type SearchView } from "./api";

function useLeft(until?: string) {
  const [left, setLeft] = useState(0);
  useEffect(() => { if (!until) return; const f = () => setLeft(Math.max(0, Math.ceil((new Date(until).getTime() - Date.now()) / 1000))); f(); const id = setInterval(f, 250); return () => clearInterval(id); }, [until]);
  return left;
}

export type MsgTarget = { id: string; display_name: string; photo_url: string | null };

/** Full-screen progress while the server rings people one by one, then the "no answer" choices. */
export function AutoSearchScreen({ v, nodeLabel, onCancel, onMore, onAllTn, onMessage, onClose }: {
  v: SearchView; nodeLabel: string; onCancel: () => void; onMore: () => void; onAllTn: () => void; onMessage: (w: MsgTarget) => void; onClose: () => void }) {
  const { t, i18n } = useTranslation(); const lang: "en" | "ta" = i18n.language?.startsWith("ta") ? "ta" : "en";
  const cur = v.current; const left = useLeft(cur?.expires_at); const total = cur ? Math.max(1, Math.round((new Date(cur.expires_at).getTime() - Date.now()) / 1000 + 0.5)) : 30;
  const [ringTotal, setRingTotal] = useState(30);
  useEffect(() => { if (cur) setRingTotal(Math.max(left, total, 1)); }, [cur?.request_id]); // eslint-disable-line react-hooks/exhaustive-deps
  const [picking, setPicking] = useState(false);
  const pct = cur ? Math.min(100, (left / ringTotal) * 100) : 0;
  const exhausted = v.status === "exhausted";
  return (
    <div data-testid="auto-search" data-status={v.status} className="fixed inset-0 z-[100] flex flex-col bg-gradient-to-b from-slate-950 via-slate-900 to-primary/70 text-white animate-in fade-in">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-between gap-6 p-6 pb-10 md:max-w-lg md:justify-center">
        {!exhausted ? (<>
          <div className="mt-6 text-center">
            <p className="text-xs font-semibold uppercase tracking-[.2em] text-white/60">{t("nearby.searching.title", { name: nodeLabel })}</p>
            <p data-testid="search-progress" className="mt-2 text-sm text-white/80">{t("nearby.searching.tryOf", { n: Math.max(1, v.round_attempts), max: v.max })}</p>
            <div className="mx-auto mt-3 flex w-40 gap-1">{Array.from({ length: v.max }).map((_, i) => (
              <span key={i} className={`h-1.5 flex-1 rounded-full transition-colors duration-500 ${i < v.round_attempts - 1 ? "bg-white/30" : i === v.round_attempts - 1 ? "bg-emerald-400" : "bg-white/10"}`} />))}</div>
          </div>
          <div className="relative grid h-64 w-64 place-items-center">
            {[0, 1, 2].map((i) => <span key={i} className="absolute inset-0 rounded-full border border-emerald-300/40 animate-ping" style={{ animationDuration: "2.4s", animationDelay: `${i * 0.8}s` }} />)}
            <span className="absolute inset-6 rounded-full bg-emerald-400/5 ring-1 ring-white/10" />
            <svg className="absolute inset-8 -rotate-90" viewBox="0 0 100 100" aria-hidden><circle cx="50" cy="50" r="46" fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="4" />
              <circle cx="50" cy="50" r="46" fill="none" stroke="rgb(52 211 153)" strokeWidth="4" strokeLinecap="round" strokeDasharray={289} strokeDashoffset={289 - (289 * pct) / 100} className="transition-[stroke-dashoffset] duration-300" /></svg>
            {cur ? (
              <div key={cur.request_id} className="relative flex flex-col items-center animate-in zoom-in-95 fade-in">
                <Avatar className="h-28 w-28 ring-4 ring-white/80">{cur.worker.photo && <AvatarImage src={cur.worker.photo} className="object-cover" />}
                  <AvatarFallback className="bg-primary text-3xl font-bold">{initials(cur.worker.name)}</AvatarFallback></Avatar>
                <span data-testid="search-countdown" className="mt-2 rounded-full bg-black/30 px-2 py-0.5 text-xs tabular-nums">{t("nearby.searching.waitS", { s: left })}</span>
              </div>
            ) : <Radar className="relative h-16 w-16 animate-spin text-emerald-300 [animation-duration:3s]" />}
          </div>
          <div className="min-h-20 text-center">
            {cur ? (<>
              <p className="text-xs text-white/60">{t("consult.ringing")}</p>
              <h2 data-testid="search-current" className="text-2xl font-bold">{cur.worker.name}</h2>
              <p className="mt-0.5 flex items-center justify-center gap-1 text-sm text-white/75">{tx(cur.worker.specialty, lang)}
                {cur.worker.distance_km != null && <><span>·</span><MapPin className="h-3.5 w-3.5" />{t("nearby.searching.away", { km: kmLabel(cur.worker.distance_km, lang) })}</>}</p>
            </>) : <p className="flex items-center gap-2 text-sm text-white/80"><Loader2 className="h-4 w-4 animate-spin" />{v.status === "matched" ? t("nearby.searching.matched") : t("nearby.searching.next")}</p>}
            <p className="mt-3 text-[11px] text-white/50">{t("nearby.searching.hint")}</p>
          </div>
          <button data-testid="search-cancel" onClick={onCancel} className="flex flex-col items-center gap-2 text-sm">
            <span className="grid h-16 w-16 place-items-center rounded-full bg-red-500 shadow-lg shadow-red-500/40 transition active:scale-90"><X className="h-7 w-7" /></span>{t("nearby.searching.cancel")}</button>
        </>) : (
          <div data-testid="no-answer" data-reason={v.reason} className="my-auto w-full space-y-4 animate-in slide-in-from-bottom-4 fade-in">
            <div className="text-center">
              <span className="mx-auto mb-3 grid h-16 w-16 place-items-center rounded-full bg-white/10"><Radar className="h-8 w-8 text-amber-300" /></span>
              <h2 className="text-2xl font-bold">{v.reason === "cap" ? t("nearby.noAnswer.title") : t("nearby.noAnswer.titleNone")}</h2>
              {v.attempts > 0 && <p className="mt-1 text-sm text-white/70">{t("nearby.noAnswer.sub", { n: v.attempts })}</p>}
            </div>
            {!picking ? (
              <div className="grid gap-2">
                {v.reason === "cap" && <Choice testId="search-more" icon={RefreshCw} title={t("nearby.noAnswer.more", { n: v.max })} onClick={onMore} primary />}
                {!v.all_tn && <Choice testId="search-all-tn" icon={Globe2} title={t("nearby.noAnswer.allTn")} onClick={onAllTn} primary={v.reason !== "cap"} />}
                {v.tried.length > 0 && <Choice testId="search-message" icon={MessageSquareText} title={t("nearby.noAnswer.message")} sub={t("nearby.noAnswer.messageSub")} onClick={() => setPicking(true)} />}
                <button data-testid="search-close" onClick={onClose} className="mt-2 text-sm font-semibold text-white/70 hover:text-white">{t("nearby.noAnswer.close")}</button>
              </div>
            ) : (
              <div className="space-y-2" data-testid="message-pick">
                <p className="text-sm font-semibold text-white/80">{t("nearby.noAnswer.pick")}</p>
                {v.tried.map((w) => (
                  <button key={w.id} data-testid="message-pick-worker" data-id={w.id} onClick={() => onMessage({ id: w.id, display_name: w.name, photo_url: w.photo })}
                    className="flex w-full items-center gap-3 rounded-2xl bg-white/10 p-3 text-left transition hover:bg-white/15 active:scale-[.99]">
                    <Avatar className="h-11 w-11">{w.photo && <AvatarImage src={w.photo} className="object-cover" />}<AvatarFallback className="bg-primary">{initials(w.name)}</AvatarFallback></Avatar>
                    <span className="flex-1"><b className="block">{w.name}</b>{w.distance_km != null && <span className="text-xs text-white/60">{kmLabel(w.distance_km, lang)}</span>}</span>
                    <MessageSquareText className="h-5 w-5 text-white/70" />
                  </button>))}
                <button onClick={() => setPicking(false)} className="w-full pt-1 text-sm text-white/60">{t("auth.back")}</button>
              </div>)}
          </div>)}
      </div>
    </div>
  );
}

function Choice({ testId, icon: Icon, title, sub, onClick, primary }: { testId: string; icon: typeof Radar; title: string; sub?: string; onClick: () => void; primary?: boolean }) {
  return (
    <button data-testid={testId} onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-2xl p-4 text-left transition active:scale-[.99] ${primary ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/30 hover:bg-emerald-400" : "bg-white/10 hover:bg-white/15"}`}>
      <Icon className="h-5 w-5 shrink-0" /><span><b className="block">{title}</b>{sub && <span className="text-xs opacity-75">{sub}</span>}</span>
    </button>
  );
}
