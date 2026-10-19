import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, Download, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";
import { inviteLinks } from "@/features/referral/capture";
import { downloadCsv } from "./csv";

type Code = { code: string; kind: "personal" | "campaign"; label: string | null; owner_name: string | null; active: boolean; max_uses: number | null; expires_at: string | null;
  uses: number; worker_uses: number; last_at: string | null; created_at: string };
type Ref = { id: number; code: string; kind: string; landing: string; referred_name: string; referred_is_worker: boolean; worker_status: string | null; referrer_name: string | null; created_at: string };

export function ReferralsAdmin() {
  const { t } = useTranslation(); const qc = useQueryClient();
  const [view, setView] = useState<"top" | "campaign" | "list">("top"); const [code, setCode] = useState<string | null>(null);
  const codes = useQuery({ queryKey: ["admin-ref-codes", view], enabled: view !== "list", queryFn: async () => {
    const { data, error } = await supabase.rpc("admin_referral_codes", { _kind: view === "campaign" ? "campaign" : "all" }); if (error) throw error; return data as unknown as Code[];
  } });
  const refs = useQuery({ queryKey: ["admin-refs", code], enabled: view === "list", queryFn: async () => {
    const { data, error } = await supabase.rpc("admin_referrals", { _code: code ?? undefined, _limit: 500 }); if (error) throw error; return data as unknown as Ref[];
  } });
  const fmt = (s: string | null) => s ? new Date(s).toLocaleString([], { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }) : "—";
  const chip = (on: boolean) => `tap shrink-0 rounded-xl px-3 text-xs font-semibold ${on ? "bg-card shadow" : "text-muted-foreground"}`;
  const toggle = async (c: Code, v: boolean) => { const { error } = await supabase.rpc("admin_set_referral_code_active", { _code: c.code, _active: v }); if (error) toast.error(error.message); else qc.invalidateQueries({ queryKey: ["admin-ref-codes"] }); };
  return (
    <div className="space-y-3" data-testid="referrals-admin">
      <p className="text-xs text-muted-foreground">{t("refAdmin.hint")}</p>
      <div className="flex gap-1 overflow-x-auto rounded-2xl bg-muted p-1 [scrollbar-width:none]">
        {(["top", "campaign", "list"] as const).map((v) => <button key={v} data-testid={`ref-view-${v}`} onClick={() => { setView(v); if (v !== "list") setCode(null); }} className={chip(view === v)}>{t(`refAdmin.v.${v}`)}</button>)}
      </div>
      {view === "campaign" && <CampaignForm onDone={() => qc.invalidateQueries({ queryKey: ["admin-ref-codes"] })} />}
      {view !== "list" && <ul className="grid gap-2 md:grid-cols-2">{codes.data?.map((c) => (
        <li key={c.code} data-testid="ref-code-row" data-code={c.code} data-uses={c.uses} className={`card-soft space-y-1 p-3 text-xs ${c.active ? "" : "opacity-60"}`}>
          <div className="flex items-center gap-2">
            <code className="font-bold tracking-wider text-primary">{c.code}</code>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px]">{t(`refAdmin.kind.${c.kind}`)}</span>
            <span className="flex-1" />
            <b data-testid="ref-uses" className="text-base">{c.uses}</b><span className="text-muted-foreground">{t("refAdmin.joined")}</span>
          </div>
          <p className="font-medium">{c.kind === "campaign" ? c.label : c.owner_name ?? t("refAdmin.deleted")}</p>
          <p className="text-muted-foreground">{t("refAdmin.workers", { n: c.worker_uses })} · {t("refAdmin.last")} {fmt(c.last_at)}{c.max_uses ? ` · ${t("refAdmin.max", { n: c.max_uses })}` : ""}{c.expires_at ? ` · ${t("refAdmin.expires")} ${fmt(c.expires_at)}` : ""}</p>
          <div className="flex items-center gap-2 pt-1">
            <button data-testid="ref-see" onClick={() => { setCode(c.code); setView("list"); }} className="rounded-lg border px-2 py-1 font-semibold">{t("refAdmin.see")}</button>
            {c.kind === "campaign" && <button aria-label={t("invite.copyCode")} onClick={() => { const link = inviteLinks(c.code).user; Promise.resolve(navigator.clipboard?.writeText(link)).then(() => { if (!navigator.clipboard) throw new Error("no clipboard"); toast.success(t("invite.copied")); }).catch(() => toast(link)); }} className="grid h-7 w-7 place-items-center rounded-lg border"><Copy className="h-3.5 w-3.5" /></button>}
            <span className="flex-1" />
            <label className="flex items-center gap-1">{t("refAdmin.active")}<Switch data-testid="ref-active" checked={c.active} onCheckedChange={(v) => toggle(c, v)} /></label>
          </div>
        </li>))}</ul>}
      {view !== "list" && codes.data?.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">{t("refAdmin.none")}</p>}
      {view === "list" && <>
        <div className="flex items-center gap-2">
          {code && <span className="rounded-full bg-primary/10 px-2 py-1 text-xs font-semibold text-primary">{code} <button onClick={() => setCode(null)} aria-label="clear">×</button></span>}
          <span className="flex-1" />
          <button data-testid="ref-csv" disabled={!refs.data?.length} onClick={() => downloadCsv(`referrals${code ? "-" + code : ""}.csv`, [["date_ist", "code", "kind", "referrer", "joined", "landing", "professional_status"],
            ...(refs.data ?? []).map((r) => [fmt(r.created_at), r.code, r.kind, r.referrer_name ?? "", r.referred_name, r.landing, r.worker_status ?? ""])])}
            className="flex items-center gap-1 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-40"><Download className="h-3.5 w-3.5" />CSV</button>
        </div>
        <ul className="space-y-1.5">{refs.data?.map((r) => (
          <li key={r.id} data-testid="ref-row" data-code={r.code} className="card-soft flex flex-wrap items-center gap-x-2 gap-y-0.5 p-2.5 text-xs">
            <b>{r.referrer_name ?? r.code}</b><span className="text-muted-foreground">→</span><b data-testid="ref-referred">{r.referred_name}</b>
            {r.referred_is_worker && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary">{t("refAdmin.pro")} · {r.worker_status}</span>}
            <span className="ml-auto text-muted-foreground">{r.code} · {fmt(r.created_at)}</span>
          </li>))}</ul>
        {refs.data?.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">{t("refAdmin.none")}</p>}
      </>}
    </div>
  );
}

function CampaignForm({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation(); const [f, setF] = useState({ code: "", label: "", max: "", exp: "" });
  const create = async () => {
    const { data, error } = await supabase.rpc("admin_create_campaign_code", { _code: f.code || undefined, _label: f.label, _max_uses: f.max ? Number(f.max) : undefined,
      _expires_at: f.exp ? new Date(`${f.exp}T23:59:59+05:30`).toISOString() : undefined } as never);
    if (error) { toast.error(error.message); return; }
    toast.success(t("refAdmin.created", { code: data })); setF({ code: "", label: "", max: "", exp: "" }); onDone();
  };
  const inp = "w-full rounded-lg border bg-card px-2 py-1.5 text-sm";
  return (
    <div className="card-soft space-y-2 p-3" data-testid="campaign-form">
      <p className="text-xs font-semibold">{t("refAdmin.newCampaign")}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <input data-testid="campaign-label" aria-label={t("refAdmin.label")} value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} placeholder={t("refAdmin.label")} className={inp} />
        <input data-testid="campaign-code" aria-label={t("refAdmin.code")} value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} placeholder={t("refAdmin.code")} className={`${inp} uppercase`} />
        <input aria-label={t("refAdmin.maxUses")} inputMode="numeric" value={f.max} onChange={(e) => setF({ ...f, max: e.target.value.replace(/\D/g, "") })} placeholder={t("refAdmin.maxUses")} className={inp} />
        <label className="flex items-center gap-2 text-xs"><span className="shrink-0 text-muted-foreground">{t("refAdmin.expires")}</span><input type="date" value={f.exp} onChange={(e) => setF({ ...f, exp: e.target.value })} className={inp} /></label>
      </div>
      <button data-testid="campaign-create" disabled={!f.label.trim()} onClick={create} className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-40"><Plus className="h-3.5 w-3.5" />{t("refAdmin.create")}</button>
    </div>
  );
}
