import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, MessageCircle, Phone, Plus, Trash2, Video } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTaxonomy } from "@/features/taxonomy/useTaxonomy";

type R = { node_slug: string; node_name: { en: string; ta?: string }; depth: number; mode: "chat" | "voice" | "video"; credits_per_min: number; min_minutes: number };
const MODES = ["chat", "voice", "video"] as const;
const Icon = { chat: MessageCircle, voice: Phone, video: Video };

export function RatesEditor() {
  const { t, i18n } = useTranslation(); const ta = i18n.language?.startsWith("ta"); const qc = useQueryClient(); const tax = useTaxonomy();
  const q = useQuery({ queryKey: ["admin-rates"], queryFn: async () => { const { data, error } = await supabase.rpc("admin_rate_cards"); if (error) throw error; return data as unknown as R[]; } });
  const [filter, setFilter] = useState(""); const [addNode, setAddNode] = useState("");
  const groups = useMemo(() => {
    const m = new Map<string, { slug: string; name: string; depth: number; rows: Partial<Record<R["mode"], R>> }>();
    for (const r of q.data ?? []) { const g = m.get(r.node_slug) ?? { slug: r.node_slug, name: (ta && r.node_name.ta) || r.node_name.en, depth: r.depth, rows: {} }; g.rows[r.mode] = r; m.set(r.node_slug, g); }
    return [...m.values()].filter((g) => !filter || g.name.toLowerCase().includes(filter.toLowerCase()) || g.slug.includes(filter.toLowerCase()));
  }, [q.data, filter, ta]);
  const candidates = (tax.data ?? []).filter((n) => n.slug.startsWith("professionals--") && !(q.data ?? []).some((r) => r.node_slug === n.slug));
  const refresh = () => { qc.invalidateQueries({ queryKey: ["admin-rates"] }); qc.invalidateQueries({ queryKey: ["admin-audit"] }); qc.invalidateQueries({ queryKey: ["search-workers"] }); };
  return (
    <div className="space-y-3" data-testid="rates-editor">
      <p className="text-xs text-muted-foreground">{t("rates.hint")}</p>
      <input data-testid="rates-filter" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={t("rates.filter")} className="w-full rounded-xl border bg-card px-3 py-2 text-sm" />
      {q.isLoading && <div className="h-32 animate-pulse rounded-2xl bg-muted" />}
      <ul className="space-y-2">{groups.map((g) => (
        <li key={g.slug} data-testid="rate-group" data-node={g.slug} className="card-soft p-3 animate-in fade-in" style={{ marginLeft: `${Math.max(0, g.depth - 2) * 12}px` }}>
          <p className="mb-2 text-sm font-semibold">{g.name} <span className="text-[10px] font-normal text-muted-foreground">{g.slug.split("--").slice(1).join(" › ")}</span></p>
          <div className="space-y-1.5">{MODES.map((m) => <RateRow key={m} node={g.slug} mode={m} r={g.rows[m]} onSaved={refresh} />)}</div>
        </li>))}</ul>
      <div className="card-soft flex gap-2 p-3">
        <select data-testid="rates-add-node" value={addNode} onChange={(e) => setAddNode(e.target.value)} className="min-w-0 flex-1 rounded-xl border bg-card px-2 py-2 text-sm">
          <option value="">{t("rates.addOverride")}</option>
          {candidates.map((n) => <option key={n.slug} value={n.slug}>{n.slug.split("--").slice(1).join(" › ")}</option>)}
        </select>
        <button data-testid="rates-add" disabled={!addNode} onClick={async () => {
          const { data } = await supabase.rpc("rates_for", { _node: addNode }); const cur = data as unknown as Record<string, { rate: number; min_minutes: number } | null>;
          for (const m of MODES) { const c = cur?.[m]; const { error } = await supabase.rpc("admin_set_rate", { _node: addNode, _mode: m, _rate: c?.rate ?? 5, _min: c?.min_minutes ?? 5 }); if (error) { toast.error(error.message); return; } }
          toast.success(t("rates.added")); setFilter(addNode.split("--").pop() ?? ""); setAddNode(""); refresh();
        }} className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-primary-foreground disabled:opacity-40"><Plus className="h-4 w-4" /></button>
      </div>
    </div>
  );
}

function RateRow({ node, mode, r, onSaved }: { node: string; mode: R["mode"]; r?: R; onSaved: () => void }) {
  const { t } = useTranslation(); const I = Icon[mode];
  const [rate, setRate] = useState(String(r?.credits_per_min ?? "")); const [min, setMin] = useState(String(r?.min_minutes ?? 5));
  const dirty = r ? Number(rate) !== Number(r.credits_per_min) || Number(min) !== r.min_minutes : rate !== "";
  const save = async () => {
    const { error } = await supabase.rpc("admin_set_rate", { _node: node, _mode: mode, _rate: Number(rate), _min: Number(min) });
    if (error) toast.error(error.message); else { toast.success(t("rates.saved")); onSaved(); }
  };
  const del = async () => { const { error } = await supabase.rpc("admin_delete_rate", { _node: node, _mode: mode }); if (error) toast.error(error.message); else onSaved(); };
  return (
    <div className="flex items-center gap-2 text-xs" data-testid="rate-row" data-mode={mode}>
      <I className="h-4 w-4 shrink-0 text-muted-foreground" /><span className="w-10">{t(`consult.mode.${mode}`)}</span>
      <label className="flex items-center gap-1 rounded-lg border px-2"><input data-testid="rate-input" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} className="w-12 bg-transparent py-1.5 outline-none" /><span className="text-muted-foreground">cr/min</span></label>
      <label className="flex items-center gap-1 rounded-lg border px-2"><span className="text-muted-foreground">min</span><input data-testid="min-input" inputMode="numeric" value={min} onChange={(e) => setMin(e.target.value)} className="w-8 bg-transparent py-1.5 outline-none" /></label>
      <span className="flex-1" />
      {dirty && <button data-testid="rate-save" onClick={save} className="grid h-7 w-7 place-items-center rounded-lg bg-primary text-primary-foreground animate-in zoom-in"><Check className="h-4 w-4" /></button>}
      {r && node.split("--").length > 2 && <button data-testid="rate-delete" onClick={del} aria-label="remove" className="grid h-7 w-7 place-items-center rounded-lg text-muted-foreground hover:bg-muted"><Trash2 className="h-3.5 w-3.5" /></button>}
    </div>
  );
}
