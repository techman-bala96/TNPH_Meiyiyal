import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Save, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";
import { useTaxonomy } from "@/features/taxonomy/useTaxonomy";

type MS = { slug: string; kind: string; threshold: number; min_reviews: number; title_i18n: { en: string; ta: string }; desc_i18n: { en: string; ta: string }; icon: string; color: string; sort: number; active: boolean };
const KINDS = ["sessions_served", "rating_avg", "positive_streak", "five_stars"]; const COLORS = ["amber", "emerald", "sky", "violet", "rose", "teal"];
const blank: MS = { slug: "", kind: "sessions_served", threshold: 10, min_reviews: 0, title_i18n: { en: "", ta: "" }, desc_i18n: { en: "", ta: "" }, icon: "award", color: "amber", sort: 100, active: true };

export function MilestonesEditor() {
  const { t } = useTranslation(); const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin-milestones"], queryFn: async () => { const { data, error } = await supabase.rpc("admin_milestones"); if (error) throw error; return data as unknown as MS[]; } });
  const [adding, setAdding] = useState(false);
  const done = () => { qc.invalidateQueries({ queryKey: ["admin-milestones"] }); qc.invalidateQueries({ queryKey: ["admin-audit"] }); setAdding(false); };
  return (
    <div className="space-y-3" data-testid="milestones-editor">
      <p className="text-xs text-muted-foreground">{t("ms.hint")}</p>
      <ul className="grid gap-2 md:grid-cols-2">{q.data?.map((m) => <li key={m.slug}><MilestoneForm m={m} onSaved={done} /></li>)}</ul>
      {adding ? <MilestoneForm m={blank} isNew onSaved={done} /> :
        <button data-testid="ms-add" onClick={() => setAdding(true)} className="flex items-center gap-1 rounded-xl border px-3 py-2 text-xs font-semibold"><Plus className="h-4 w-4" />{t("ms.add")}</button>}
    </div>
  );
}

function MilestoneForm({ m, isNew, onSaved }: { m: MS; isNew?: boolean; onSaved: () => void }) {
  const { t } = useTranslation(); const [f, setF] = useState<MS>(m);
  const save = async () => {
    const { error } = await supabase.rpc("admin_upsert_milestone", { _slug: f.slug, _kind: f.kind, _threshold: Number(f.threshold), _min_reviews: Number(f.min_reviews), _title: f.title_i18n, _desc: f.desc_i18n, _icon: f.icon, _color: f.color, _sort: Number(f.sort), _active: f.active });
    if (error) toast.error(error.message); else { toast.success(t("admin.saved")); onSaved(); }
  };
  const inp = "w-full rounded-lg border bg-card px-2 py-1.5 text-sm";
  return (
    <div data-testid="ms-card" data-slug={m.slug} className="card-soft h-full space-y-2 p-3 text-xs">
      <div className="flex items-center gap-2">
        {isNew ? <input data-testid="ms-slug" value={f.slug} onChange={(e) => setF({ ...f, slug: e.target.value.toLowerCase() })} placeholder="slug_like_this" className={inp} /> : <p className="flex-1 font-mono text-[11px] text-muted-foreground">{m.slug}</p>}
        <label className="flex items-center gap-1"><Switch data-testid="ms-active" checked={f.active} onCheckedChange={(c) => setF({ ...f, active: c })} />{t("ms.active")}</label>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input data-testid="ms-title-en" value={f.title_i18n.en} onChange={(e) => setF({ ...f, title_i18n: { ...f.title_i18n, en: e.target.value } })} placeholder={t("ms.titleEn")} className={inp} />
        <input data-testid="ms-title-ta" lang="ta" value={f.title_i18n.ta} onChange={(e) => setF({ ...f, title_i18n: { ...f.title_i18n, ta: e.target.value } })} placeholder={t("ms.titleTa")} className={inp} />
        <input data-testid="ms-desc-en" value={f.desc_i18n.en} onChange={(e) => setF({ ...f, desc_i18n: { ...f.desc_i18n, en: e.target.value } })} placeholder={t("ms.descEn")} className={inp} />
        <input data-testid="ms-desc-ta" lang="ta" value={f.desc_i18n.ta} onChange={(e) => setF({ ...f, desc_i18n: { ...f.desc_i18n, ta: e.target.value } })} placeholder={t("ms.descTa")} className={inp} />
        <select aria-label={t("ms.kind")} data-testid="ms-kind" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })} className={inp}>{KINDS.map((k) => <option key={k} value={k}>{t(`ms.k.${k}`)}</option>)}</select>
        <label className="flex items-center gap-1 rounded-lg border px-2"><span className="text-muted-foreground">{t("ms.threshold")}</span><input data-testid="ms-threshold" inputMode="decimal" value={f.threshold} onChange={(e) => setF({ ...f, threshold: e.target.value as unknown as number })} className="w-full bg-transparent py-1.5 outline-none" /></label>
        <label className="flex items-center gap-1 rounded-lg border px-2"><span className="text-muted-foreground">{t("ms.minReviews")}</span><input inputMode="numeric" value={f.min_reviews} onChange={(e) => setF({ ...f, min_reviews: e.target.value as unknown as number })} className="w-full bg-transparent py-1.5 outline-none" /></label>
        <select aria-label={t("ms.color")} value={f.color} onChange={(e) => setF({ ...f, color: e.target.value })} className={inp}>{COLORS.map((c) => <option key={c} value={c}>{c}</option>)}</select>
      </div>
      <button data-testid="ms-save" onClick={save} className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 font-semibold text-primary-foreground"><Save className="h-3.5 w-3.5" />{t("admin.save")}</button>
    </div>
  );
}

type CR = { node_slug: string; node_name: { en: string; ta?: string }; depth: number; pct: number };
export function CommissionEditor() {
  const { t, i18n } = useTranslation(); const ta = i18n.language?.startsWith("ta"); const qc = useQueryClient(); const tax = useTaxonomy();
  const q = useQuery({ queryKey: ["admin-commission"], queryFn: async () => { const { data, error } = await supabase.rpc("admin_commission_rules"); if (error) throw error; return data as unknown as CR[]; } });
  const [node, setNode] = useState(""); const [pct, setPct] = useState("18");
  const set = async (slug: string, v: number | null) => {
    const { error } = await supabase.rpc("admin_set_commission", { _node: slug, _pct: v as number });
    if (error) toast.error(error.message); else { toast.success(t("admin.saved")); qc.invalidateQueries({ queryKey: ["admin-commission"] }); qc.invalidateQueries({ queryKey: ["admin-audit"] }); setNode(""); }
  };
  const candidates = (tax.data ?? []).filter((n) => n.slug.startsWith("professionals--") && !(q.data ?? []).some((r) => r.node_slug === n.slug));
  return (
    <div className="space-y-3" data-testid="commission-editor">
      <p className="text-xs text-muted-foreground">{t("commission.hint")}</p>
      <ul className="space-y-1.5">{q.data?.map((r) => <CommissionRow key={r.node_slug} r={r} name={(ta && r.node_name.ta) || r.node_name.en} onSet={set} />)}</ul>
      {q.data?.length === 0 && <p className="text-xs text-muted-foreground">{t("commission.none")}</p>}
      <div className="card-soft flex flex-wrap gap-2 p-3">
        <select aria-label={t("commission.pick")} data-testid="commission-node" value={node} onChange={(e) => setNode(e.target.value)} className="min-w-0 flex-1 rounded-xl border bg-card px-2 py-2 text-sm">
          <option value="">{t("commission.pick")}</option>{candidates.map((n) => <option key={n.slug} value={n.slug}>{n.slug.split("--").slice(1).join(" › ")}</option>)}</select>
        <input aria-label="%" data-testid="commission-pct" inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value)} className="w-16 rounded-xl border bg-card px-2 py-2 text-sm" />
        <button data-testid="commission-add" disabled={!node} onClick={() => set(node, Number(pct))} aria-label={t("commission.add")} className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-primary-foreground disabled:opacity-40"><Plus className="h-4 w-4" /></button>
      </div>
    </div>
  );
}
function CommissionRow({ r, name, onSet }: { r: CR; name: string; onSet: (s: string, v: number | null) => void }) {
  const { t } = useTranslation(); const [v, setV] = useState(String(r.pct));
  return (
    <li data-testid="commission-row" data-node={r.node_slug} className="card-soft flex items-center gap-2 p-2.5 text-sm">
      <span className="min-w-0 flex-1 truncate font-medium">{name} <span className="text-[10px] text-muted-foreground">{r.node_slug.split("--").slice(1).join(" › ")}</span></span>
      <input aria-label="%" inputMode="decimal" value={v} onChange={(e) => setV(e.target.value)} className="w-14 rounded-lg border bg-card px-2 py-1 text-sm" /><span>%</span>
      {Number(v) !== Number(r.pct) && <button aria-label={t("admin.save")} onClick={() => onSet(r.node_slug, Number(v))} className="grid h-7 w-7 place-items-center rounded-lg bg-primary text-primary-foreground"><Save className="h-3.5 w-3.5" /></button>}
      <button aria-label={t("commission.remove")} data-testid="commission-remove" onClick={() => onSet(r.node_slug, null)} className="grid h-7 w-7 place-items-center rounded-lg text-muted-foreground hover:bg-muted"><Trash2 className="h-3.5 w-3.5" /></button>
    </li>
  );
}
