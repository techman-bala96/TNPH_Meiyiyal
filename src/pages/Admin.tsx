import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, ExternalLink, Loader2, ShieldX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { PacksEditor, PaymentsView, PayoutsAdmin } from "@/features/admin/Payments";
import { PageShell } from "@/components/app/PageShell";
import { supabase } from "@/integrations/supabase/client";
import { Splash } from "@/components/app/Guards";
import { useIsAdmin } from "@/features/worker/api";
import { AuditLog, Moderation } from "@/features/admin/Moderation";
import { RatesEditor } from "@/features/admin/Rates";

type Check = { check: string; status: string; score?: number | null; reason?: string | null; provider?: string | null };
type Row = { id: string; display_name: string; primary_node: string; node_name: { en: string; ta?: string } | null; years_experience: number; about: string | null;
  reg_data: Record<string, string>; status: string; submitted_at: string; district_slug: string | null; aadhaar_verified: boolean; aadhaar_masked: string | null;
  docs: { type: string; path: string; mime: string }[]; email: string | null; phone: string | null;
  case_id?: string | null; case_status?: string | null; risk?: number | null; badge_tier?: string | null; sla_due_at?: string | null;
  checks?: Check[]; deep_link?: string | null; reason_codes?: string[] | null };


export default function Admin() {
  const { t } = useTranslation(); const admin = useIsAdmin(); const qc = useQueryClient();
  const [status, setStatus] = useState("pending"); const [tab, setTab] = useState<"queue" | "moderation" | "rates" | "audit" | "packs" | "payments" | "payouts">("queue");
  const q = useQuery({ queryKey: ["admin-queue", status], enabled: admin.data === true, queryFn: async () => {
    const { data, error } = await supabase.rpc("admin_worker_queue", { _status: status }); if (error) throw error; return data as unknown as Row[];
  } });
  if (admin.isLoading) return <Splash />;
  if (!admin.data) return <Navigate to="/" replace />;

  return (
    <PageShell title={t("admin.title")} testId="admin-page">
      <div className="grid grid-cols-4 gap-1 rounded-2xl bg-primary/10 p-1">
        {(["queue", "moderation", "rates", "audit", "packs", "payments", "payouts"] as const).map((k) => (
          <button key={k} data-testid={`admin-tab-${k}`} onClick={() => setTab(k)} className={`rounded-xl py-2 text-xs font-semibold transition ${tab === k ? "bg-primary text-primary-foreground shadow" : "text-primary"}`}>{t(`admin.tab.${k}`)}</button>))}
      </div>
      {tab === "moderation" && <Moderation />}
      {tab === "rates" && <RatesEditor />}
      {tab === "audit" && <AuditLog />}
      {tab === "packs" && <PacksEditor />}
      {tab === "payments" && <PaymentsView />}
      {tab === "payouts" && <PayoutsAdmin />}
      {tab === "queue" && <>
      <div className="flex gap-1 overflow-x-auto rounded-2xl bg-muted p-1 [scrollbar-width:none]">
        {["pending", "needs_info", "approved", "rejected", "all"].map((s) => (
          <button key={s} data-testid={`admin-filter-${s}`} onClick={() => setStatus(s)} className={`tap shrink-0 rounded-xl px-3 text-xs font-semibold ${status === s ? "bg-card shadow" : "text-muted-foreground"}`}>{t(`admin.f.${s}`)}</button>
        ))}
      </div>
      {q.isLoading && <div className="h-32 animate-pulse rounded-2xl bg-muted" />}
      {q.data?.length === 0 && <p data-testid="admin-empty" className="py-10 text-center text-sm text-muted-foreground">{t("admin.empty")}</p>}
      <ul className="space-y-3">{q.data?.map((r) => <AdminCard key={r.id} r={r} onDone={() => qc.invalidateQueries({ queryKey: ["admin-queue"] })} />)}</ul>
      </>}
    </PageShell>
  );
}

function AdminCard({ r, onDone }: { r: Row; onDone: () => void }) {
  const { t } = useTranslation(); const [note, setNote] = useState(""); const [busy, setBusy] = useState<string | null>(null); const [err, setErr] = useState<string | null>(null);
  const hrs = r.submitted_at ? (Date.now() - new Date(r.submitted_at).getTime()) / 36e5 : 0;
  async function open(path: string) {
    const { data } = await supabase.storage.from("worker-docs").createSignedUrl(path, 120);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener");
  }
  async function decide(d: string) {
    setBusy(d); setErr(null);
    const { error } = await supabase.rpc("admin_decide_worker", { _worker: r.id, _decision: d, _note: note || undefined });
    setBusy(null); if (error) setErr(error.message); else onDone();
  }
  return (
    <li data-testid="admin-card" data-name={r.display_name} className="card-soft space-y-3 p-4">
      <div className="flex items-start justify-between gap-2">
        <div><p className="font-semibold">{r.display_name}</p><p className="text-xs text-muted-foreground">{r.node_name?.en} · {r.years_experience} yrs · {r.district_slug}</p>
          <p className="text-xs text-muted-foreground">{r.email || r.phone}</p></div>
        {r.status === "pending" && <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${hrs > 24 ? "bg-destructive/15 text-destructive" : "bg-amber-500/15 text-amber-700 dark:text-amber-300"}`}>{Math.floor(hrs)}h / 24h</span>}
      </div>
      <p className={`flex items-center gap-1 text-xs font-medium ${r.aadhaar_verified ? "text-primary" : "text-destructive"}`}>{r.aadhaar_verified ? <BadgeCheck className="h-4 w-4" /> : <ShieldX className="h-4 w-4" />}Aadhaar {r.aadhaar_masked ?? "—"}</p>
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        {r.badge_tier && <span data-testid="badge-tier" data-tier={r.badge_tier} className="rounded-full bg-primary/10 px-2 py-0.5 font-semibold text-primary">{t(`worker.badge.${r.badge_tier}`)}</span>}
        {r.risk != null && <span className="text-muted-foreground">{t("admin.risk")} {Number(r.risk)}</span>}
        {r.sla_due_at && <span className="text-muted-foreground">{t("admin.sla")} {new Date(r.sla_due_at).toLocaleString()}</span>}
        {r.deep_link && <a href={r.deep_link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-primary">{t("admin.registry")}<ExternalLink className="h-3 w-3" /></a>}
      </div>
      {(r.checks?.length ?? 0) > 0 && (
        <ul data-testid="admin-checks" className="flex flex-wrap gap-1">
          {r.checks!.map((c) => <li key={c.check} data-testid="verify-check" data-check={c.check} data-status={c.status} className="rounded-full border px-2 py-0.5 text-[11px]">{c.check}: {c.status}{c.reason ? ` (${c.reason})` : ""}</li>)}
        </ul>
      )}
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">{Object.entries(r.reg_data).map(([k, v]) => <div key={k} className="contents"><dt className="text-muted-foreground">{k}</dt><dd className="font-medium">{v}</dd></div>)}</dl>
      <div className="flex flex-wrap gap-2">{r.docs.map((d) => <button key={d.type} onClick={() => open(d.path)} className="flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs">{d.type}<ExternalLink className="h-3 w-3" /></button>)}</div>
      {r.status !== "approved" && (<>
        <Textarea data-testid="admin-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("admin.note")} rows={2} className="rounded-xl text-sm" />
        {err && <p className="text-xs text-destructive">{err}</p>}
        <div className="grid grid-cols-3 gap-2">
          <Button data-testid="admin-approve" size="sm" className="rounded-xl" disabled={!!busy} onClick={() => decide("approve")}>{busy === "approve" && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}{t("admin.approve")}</Button>
          <Button data-testid="admin-needs-info" size="sm" variant="outline" className="rounded-xl" disabled={!!busy} onClick={() => decide("needs_info")}>{t("admin.needsInfo")}</Button>
          <Button data-testid="admin-reject" size="sm" variant="destructive" className="rounded-xl" disabled={!!busy} onClick={() => decide("reject")}>{t("admin.reject")}</Button>
        </div></>)}
    </li>
  );
}
