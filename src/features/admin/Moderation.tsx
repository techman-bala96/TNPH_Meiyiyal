import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Flag, ShieldBan, ShieldCheck, Star } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { initials } from "@/features/profile/useProfile";

type M = { id: string; display_name: string; photo_url: string | null; node_name: { en: string } | null; flag_active: boolean; flag_good_needed: number; flag_reason: string | null;
  blocked_until: string | null; block_reason: string | null; blocked: boolean; negatives: number; rating: number; reviews: number;
  recent: { rating: number; is_complaint: boolean; complaint_reason: string | null; tags: string[]; comment: string | null; created_at: string }[] };
type A = { id: number; actor_name: string; action: string; target_name: string | null; note: string | null; data: Record<string, unknown> | null; created_at: string };

export function Moderation() {
  const { t } = useTranslation();
  const q = useQuery({ queryKey: ["admin-moderation"], queryFn: async () => { const { data, error } = await supabase.rpc("admin_moderation"); if (error) throw error; return data as unknown as M[]; } });
  if (q.isLoading) return <div className="h-32 animate-pulse rounded-2xl bg-muted" />;
  if (!q.data?.length) return <p data-testid="mod-empty" className="py-10 text-center text-sm text-muted-foreground">{t("mod.empty")}</p>;
  return <ul className="space-y-3">{q.data.map((m) => <ModCard key={m.id} m={m} />)}</ul>;
}

function ModCard({ m }: { m: M }) {
  const { t } = useTranslation(); const qc = useQueryClient(); const [note, setNote] = useState(""); const [days, setDays] = useState(7); const [busy, setBusy] = useState(false);
  const act = async (action: string) => {
    setBusy(true); const { error } = await supabase.rpc("admin_moderate", { _worker: m.id, _action: action, _note: note, _days: action === "extend" ? days : undefined }); setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(t(`mod.done.${action}`)); setNote(""); qc.invalidateQueries({ queryKey: ["admin-moderation"] }); qc.invalidateQueries({ queryKey: ["admin-audit"] });
  };
  return (
    <li data-testid="mod-card" data-id={m.id} data-name={m.display_name} data-blocked={m.blocked} className="card-soft space-y-3 p-4 animate-in fade-in">
      <div className="flex items-center gap-3">
        <Avatar className="h-11 w-11">{m.photo_url && <AvatarImage src={m.photo_url} />}<AvatarFallback>{initials(m.display_name)}</AvatarFallback></Avatar>
        <div className="min-w-0 flex-1"><p className="font-semibold">{m.display_name}</p><p className="text-xs text-muted-foreground">{m.node_name?.en} · ★ {Number(m.rating).toFixed(1)} ({m.reviews})</p></div>
        {m.blocked ? <span className="flex items-center gap-1 rounded-full bg-rose-500/15 px-2 py-0.5 text-[11px] font-bold text-rose-600"><ShieldBan className="h-3 w-3" />{t("mod.blocked")}</span>
          : m.flag_active ? <span className="flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-bold text-amber-700"><Flag className="h-3 w-3" />{t("mod.flagged")}</span>
          : <span className="rounded-full bg-muted px-2 py-0.5 text-[11px]">{t("mod.clear")}</span>}
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <p><span className="text-muted-foreground">{t("mod.negatives")}</span> <b data-testid="mod-negatives">{m.negatives}</b></p>
        {m.blocked && <p data-testid="mod-until"><span className="text-muted-foreground">{t("mod.until")}</span> <b>{new Date(m.blocked_until!).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</b></p>}
        {m.flag_active && <p><span className="text-muted-foreground">{t("mod.goodNeeded")}</span> <b>{m.flag_good_needed}</b></p>}
        {(m.block_reason || m.flag_reason) && <p className="col-span-2"><span className="text-muted-foreground">{t("mod.reason")}</span> {m.block_reason ?? m.flag_reason}</p>}
      </div>
      {m.recent.length > 0 && <ul className="space-y-1 rounded-xl bg-muted/50 p-2 text-xs">{m.recent.map((f, i) => (
        <li key={i} className="flex gap-2"><span className="flex shrink-0 items-center gap-0.5"><Star className="h-3 w-3 fill-amber-400 text-amber-400" />{f.rating}</span>
          {f.is_complaint && <b className="text-rose-600">{f.complaint_reason}</b>}<span className="truncate text-muted-foreground">{[...f.tags, f.comment].filter(Boolean).join(" · ")}</span></li>))}</ul>}
      <Textarea data-testid="mod-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("mod.note")} rows={2} className="rounded-xl text-sm" />
      <div className="flex flex-wrap items-center gap-2">
        {m.blocked && <button data-testid="mod-unblock" disabled={busy || !note.trim()} onClick={() => act("unblock")} className="flex items-center gap-1 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"><ShieldCheck className="h-3.5 w-3.5" />{t("mod.unblock")}</button>}
        <span className="flex items-center gap-1 rounded-xl border px-2 text-xs">
          <input data-testid="mod-days" type="number" min={1} max={365} value={days} onChange={(e) => setDays(Number(e.target.value))} className="w-12 bg-transparent py-2 outline-none" />{t("mod.days")}</span>
        <button data-testid="mod-extend" disabled={busy || !note.trim()} onClick={() => act("extend")} className="rounded-xl bg-rose-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">{m.blocked ? t("mod.extend") : t("mod.block")}</button>
        {m.flag_active && <button data-testid="mod-clear-flag" disabled={busy || !note.trim()} onClick={() => act("clear_flag")} className="rounded-xl border px-3 py-2 text-xs font-semibold disabled:opacity-40">{t("mod.clearFlag")}</button>}
      </div>
    </li>
  );
}

export function AuditLog() {
  const { t } = useTranslation();
  const q = useQuery({ queryKey: ["admin-audit"], queryFn: async () => { const { data, error } = await supabase.rpc("admin_audit_log", { _limit: 100 }); if (error) throw error; return data as unknown as A[]; } });
  return (
    <ol className="relative space-y-3 border-l pl-4" data-testid="audit-log">
      {q.data?.map((a) => (
        <li key={a.id} data-testid="audit-row" data-action={a.action} className="relative text-sm animate-in fade-in">
          <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-primary" />
          <p><b>{t(`audit.${a.action.replace(".", "_")}`, { defaultValue: a.action })}</b>{a.target_name && <> · {a.target_name}</>}</p>
          <p className="text-xs text-muted-foreground">{a.actor_name} · {new Date(a.created_at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</p>
          {a.note && <p className="text-xs">{a.note}</p>}
          {a.action === "rate.set" && a.data && <p className="text-xs text-muted-foreground">{String(a.data.old_rate ?? "—")} → {String(a.data.rate)} cr/min · min {String(a.data.min)}</p>}
        </li>))}
    </ol>
  );
}
