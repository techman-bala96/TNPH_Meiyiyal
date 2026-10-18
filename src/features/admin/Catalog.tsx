import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronRight, Plus, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";

type Node = { slug: string; parent_slug: string | null; kind: string; name_i18n: { en: string; ta?: string }; synonyms: string[]; sort: number; is_active: boolean; workers: number;
  doc_types: string[] | null; req_schema: Record<string, unknown> | null };
type Rule = { category_slug: string; check_name: string; required: boolean; weight: number; params: Record<string, unknown> };
const CHECKS = ["identity", "face", "registry", "degree", "name", "forensics", "duplicates"] as const;

const call = async (fn: string, args: Record<string, unknown>) => { const { data, error } = await supabase.rpc(fn as never, args as never); if (error) throw error; return data; };

export function CatalogEditor() {
  const { t, i18n } = useTranslation(); const ta = i18n.language?.startsWith("ta"); const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin-taxonomy"], queryFn: async () => (await call("admin_taxonomy", {})) as Node[] });
  const rules = useQuery({ queryKey: ["admin-vrules"], queryFn: async () => (await call("admin_verification_rules", {})) as Rule[] });
  const [filter, setFilter] = useState(""); const [open, setOpen] = useState<string | null>(null);
  const list = useMemo(() => (q.data ?? []).filter((n) => n.slug !== "professionals" && (!filter || (n.slug + n.name_i18n.en + (n.name_i18n.ta ?? "")).toLowerCase().includes(filter.toLowerCase()))), [q.data, filter]);
  const refresh = () => { qc.invalidateQueries({ queryKey: ["admin-taxonomy"] }); qc.invalidateQueries({ queryKey: ["admin-vrules"] }); qc.invalidateQueries({ queryKey: ["taxonomy"] }); qc.invalidateQueries({ queryKey: ["admin-audit"] }); };
  return (
    <div className="space-y-3" data-testid="catalog-editor">
      <p className="text-xs text-muted-foreground">{t("catalog.hint")}</p>
      <input data-testid="catalog-filter" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={t("rates.filter")} className="w-full rounded-xl border bg-card px-3 py-2 text-sm" />
      {q.isLoading && <div className="h-32 animate-pulse rounded-2xl bg-muted" />}
      <ul className="space-y-1.5">{list.map((n) => {
        const depth = n.slug.split("--").length - 2;
        return (
          <li key={n.slug} data-testid="cat-node" data-slug={n.slug} data-active={n.is_active} style={{ marginLeft: `${Math.min(depth, 3) * 14}px` }} className={`card-soft p-2.5 ${n.is_active ? "" : "opacity-60"}`}>
            <button data-testid="cat-node-open" onClick={() => setOpen(open === n.slug ? null : n.slug)} className="flex w-full items-center gap-2 text-left">
              <ChevronRight className={`h-4 w-4 shrink-0 transition ${open === n.slug ? "rotate-90" : ""}`} />
              <span className="min-w-0 flex-1"><span className="text-sm font-semibold">{(ta && n.name_i18n.ta) || n.name_i18n.en}</span>
                <span className="ml-2 text-[10px] text-muted-foreground">{t(`catalog.kind.${n.kind}`)} · {t("catalog.workers", { n: n.workers })}</span></span>
              {!n.is_active && <span className="rounded-full bg-muted px-2 py-0.5 text-[10px]">{t("catalog.hidden")}</span>}
            </button>
            {open === n.slug && <NodeForm n={n} rules={(rules.data ?? []).filter((r) => r.category_slug === n.slug)} onSaved={refresh} />}
          </li>);
      })}</ul>
      <RulesCard title={t("catalog.baseRules")} slug="professionals" rules={(rules.data ?? []).filter((r) => r.category_slug === "professionals")} onSaved={refresh} />
    </div>
  );
}

function NodeForm({ n, rules, onSaved }: { n: Node; rules: Rule[]; onSaved: () => void }) {
  const { t } = useTranslation();
  const [en, setEn] = useState(n.name_i18n.en); const [ta, setTa] = useState(n.name_i18n.ta ?? ""); const [syn, setSyn] = useState(n.synonyms.join(", "));
  const [sort, setSort] = useState(String(n.sort)); const [active, setActive] = useState(n.is_active); const [docs, setDocs] = useState((n.doc_types ?? []).join(", "));
  const [child, setChild] = useState({ suffix: "", en: "", ta: "" });
  const parent = n.parent_slug ?? "professionals"; const suffix = n.slug.slice(parent.length + 2);
  const run = async (f: () => Promise<unknown>, msg = t("admin.saved")) => { try { await f(); toast.success(msg); onSaved(); } catch (e) { toast.error((e as Error).message); } };
  const save = () => run(() => call("admin_upsert_node", { _parent: parent, _suffix: suffix, _name: { en, ta }, _synonyms: syn.split(",").map((s) => s.trim()).filter(Boolean), _sort: Number(sort) || 0, _active: active }));
  const saveDocs = () => run(() => call("admin_set_requirements", { _node: n.slug, _doc_types: docs.split(",").map((s) => s.trim()).filter(Boolean) }));
  const add = () => run(() => call("admin_upsert_node", { _parent: n.slug, _suffix: child.suffix.trim(), _name: { en: child.en, ta: child.ta }, _synonyms: [], _sort: 100, _active: true }).then(() => setChild({ suffix: "", en: "", ta: "" })), t("catalog.added"));
  const inp = "w-full rounded-lg border bg-card px-2 py-1.5 text-sm";
  return (
    <div className="mt-3 space-y-3 border-t pt-3 text-xs" data-testid="cat-form">
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="space-y-1"><span className="text-muted-foreground">{t("catalog.nameEn")}</span><input data-testid="cat-en" value={en} onChange={(e) => setEn(e.target.value)} className={inp} /></label>
        <label className="space-y-1"><span className="text-muted-foreground">{t("catalog.nameTa")}</span><input data-testid="cat-ta" lang="ta" value={ta} onChange={(e) => setTa(e.target.value)} className={inp} /></label>
        <label className="space-y-1 sm:col-span-2"><span className="text-muted-foreground">{t("catalog.synonyms")}</span><input value={syn} onChange={(e) => setSyn(e.target.value)} className={inp} /></label>
        <label className="space-y-1"><span className="text-muted-foreground">{t("catalog.sort")}</span><input inputMode="numeric" value={sort} onChange={(e) => setSort(e.target.value)} className={inp} /></label>
        <label className="flex items-center justify-between gap-2 self-end rounded-lg border px-2 py-1.5"><span>{t("catalog.visible")}</span><Switch data-testid="cat-active" checked={active} onCheckedChange={setActive} /></label>
      </div>
      <button data-testid="cat-save" onClick={save} className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 font-semibold text-primary-foreground"><Save className="h-3.5 w-3.5" />{t("admin.save")}</button>
      <div className="space-y-1">
        <p className="font-semibold">{t("catalog.docs")}</p>
        <div className="flex gap-2"><input data-testid="cat-docs" value={docs} onChange={(e) => setDocs(e.target.value)} placeholder="degree_cert, council_cert" className={inp} />
          <button data-testid="cat-docs-save" onClick={saveDocs} aria-label={t("admin.save")} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground"><Save className="h-3.5 w-3.5" /></button></div>
      </div>
      {n.kind !== "group" && <RulesCard slug={n.slug} rules={rules} onSaved={onSaved} />}
      {n.kind !== "specialty" && <div className="space-y-1 rounded-lg bg-muted/50 p-2">
        <p className="font-semibold">{t("catalog.addChild")}</p>
        <div className="grid gap-2 sm:grid-cols-3">
          <input data-testid="cat-child-slug" value={child.suffix} onChange={(e) => setChild({ ...child, suffix: e.target.value.toLowerCase() })} placeholder="slug-like-this" className={inp} />
          <input data-testid="cat-child-en" value={child.en} onChange={(e) => setChild({ ...child, en: e.target.value })} placeholder={t("catalog.nameEn")} className={inp} />
          <input data-testid="cat-child-ta" lang="ta" value={child.ta} onChange={(e) => setChild({ ...child, ta: e.target.value })} placeholder={t("catalog.nameTa")} className={inp} />
        </div>
        <button data-testid="cat-child-add" disabled={!child.suffix || !child.en || !child.ta} onClick={add} className="flex items-center gap-1 rounded-lg border px-3 py-1.5 font-semibold disabled:opacity-40"><Plus className="h-3.5 w-3.5" />{t("catalog.add")}</button>
      </div>}
    </div>
  );
}

function RulesCard({ slug, rules, onSaved, title }: { slug: string; rules: Rule[]; onSaved: () => void; title?: string }) {
  const { t } = useTranslation();
  const set = async (check: string, required: boolean, weight: number) => {
    try { await call("admin_set_verification_rule", { _cat: slug, _check: check, _required: required, _weight: weight }); toast.success(t("admin.saved")); onSaved(); } catch (e) { toast.error((e as Error).message); }
  };
  const shown = title ? CHECKS.filter((c) => c !== "registry") : (["registry"] as const);
  return (
    <div className={`space-y-1 ${title ? "card-soft p-3" : ""}`} data-testid="rules-card" data-slug={slug}>
      <p className="text-xs font-semibold">{title ?? t("catalog.rules")}</p>
      {!title && rules.length === 0 && <p className="text-[11px] text-muted-foreground">{t("catalog.inherits")}</p>}
      {shown.map((c) => { const r = rules.find((x) => x.check_name === c); if (!r && !title) return <RuleRow key={c} check={c} onSet={set} />; return r ? <RuleRow key={c} check={c} r={r} onSet={set} /> : null; })}
    </div>
  );
}

function RuleRow({ check, r, onSet }: { check: string; r?: Rule; onSet: (c: string, req: boolean, w: number) => void }) {
  const { t } = useTranslation(); const [w, setW] = useState(String(r?.weight ?? 30));
  return (
    <div className="flex items-center gap-2 text-xs" data-testid="rule-row" data-check={check}>
      <span className="w-20 font-medium">{t(`catalog.check.${check}`)}</span>
      <label className="flex items-center gap-1"><Switch data-testid="rule-required" checked={r?.required ?? false} onCheckedChange={(c) => onSet(check, c, Number(w) || 0)} /><span>{t("catalog.required")}</span></label>
      <label className="ml-auto flex items-center gap-1 rounded-lg border px-2"><span className="text-muted-foreground">{t("catalog.weight")}</span>
        <input inputMode="numeric" value={w} onChange={(e) => setW(e.target.value)} onBlur={() => r && Number(w) !== Number(r.weight) && onSet(check, r.required, Number(w) || 0)} className="w-10 bg-transparent py-1 outline-none" /></label>
    </div>
  );
}
