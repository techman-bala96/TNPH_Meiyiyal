import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Info, Loader2, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";

export type Spec = { key: string; grp: string; kind: "number" | "bool" | "text" | "enum" | "json"; min: number | null; max: number | null; options: string[] | null;
  label_i18n: { en: string; ta?: string }; prod_hint: string | null; value: unknown; sort: number };
const GROUPS = ["verification", "money", "consult", "moderation", "notifications", "referrals", "security", "dev"] as const;

export function useAdminSettings() {
  return useQuery({ queryKey: ["admin-settings"], queryFn: async () => { const { data, error } = await supabase.rpc("admin_settings"); if (error) throw error; return data as unknown as Spec[]; } });
}
export async function saveSetting(key: string, value: unknown) {
  const { error } = await supabase.rpc("admin_set_setting", { _key: key, _value: value as never });
  if (error) throw error;
}

export function SettingsEditor() {
  const { t, i18n } = useTranslation(); const ta = i18n.language?.startsWith("ta");
  const q = useAdminSettings(); const [grp, setGrp] = useState<string>("verification"); const [filter, setFilter] = useState("");
  const rows = useMemo(() => (q.data ?? []).filter((s) => (filter ? (s.key + " " + s.label_i18n.en + " " + (s.label_i18n.ta ?? "")).toLowerCase().includes(filter.toLowerCase()) : s.grp === grp)), [q.data, grp, filter]);
  const present = new Set((q.data ?? []).map((s) => s.grp));
  return (
    <div className="space-y-3" data-testid="settings-editor">
      <p className="text-xs text-muted-foreground">{t("adminSet.hint")}</p>
      <input data-testid="settings-filter" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={t("adminSet.filter")} className="w-full rounded-xl border bg-card px-3 py-2 text-sm" />
      {!filter && <div className="flex gap-1 overflow-x-auto rounded-2xl bg-muted p-1 [scrollbar-width:none]">
        {GROUPS.filter((g) => present.has(g)).map((g) => <button key={g} data-testid={`settings-grp-${g}`} onClick={() => setGrp(g)} className={`tap shrink-0 rounded-xl px-3 text-xs font-semibold ${grp === g ? "bg-card shadow" : "text-muted-foreground"}`}>{t(`adminSet.grp.${g}`)}</button>)}
      </div>}
      {q.isLoading && <div className="h-32 animate-pulse rounded-2xl bg-muted" />}
      {q.error && <p className="text-sm text-destructive">{(q.error as Error).message}</p>}
      <ul className="grid gap-2 md:grid-cols-2">{rows.map((s) => <li key={s.key}>{s.key === "verify_auto_approve_categories" ? <CategorySwitches s={s} /> : <SettingRow s={s} label={(ta && s.label_i18n.ta) || s.label_i18n.en} />}</li>)}</ul>
    </div>
  );
}

function fmt(s: Spec, v: unknown) { return s.kind === "json" ? JSON.stringify(v, null, 2) : s.kind === "bool" ? String(v) : typeof v === "string" ? v : String(v ?? ""); }

function SettingRow({ s, label }: { s: Spec; label: string }) {
  const { t } = useTranslation(); const qc = useQueryClient();
  const [val, setVal] = useState(fmt(s, s.value)); const [busy, setBusy] = useState(false);
  const dirty = val !== fmt(s, s.value);
  const commit = async (raw: string) => {
    let v: unknown = raw;
    try {
      if (s.kind === "number") v = Number(raw);
      else if (s.kind === "bool") v = raw === "true";
      else if (s.kind === "json") v = JSON.parse(raw);
    } catch { toast.error(t("adminSet.badJson")); return; }
    setBusy(true);
    try { await saveSetting(s.key, v); toast.success(t("admin.saved")); await qc.invalidateQueries({ queryKey: ["admin-settings"] }); qc.invalidateQueries({ queryKey: ["admin-audit"] }); }
    catch (e) { toast.error((e as Error).message); setVal(fmt(s, s.value)); }
    finally { setBusy(false); }
  };
  return (
    <div data-testid="setting-row" data-key={s.key} className="card-soft flex h-full flex-col gap-2 p-3">
      <div className="flex items-start justify-between gap-2">
        <label htmlFor={`set-${s.key}`} className="text-sm font-medium leading-snug">{label}</label>
        {s.kind === "bool" && <Switch id={`set-${s.key}`} data-testid="setting-switch" checked={val === "true"} disabled={busy} onCheckedChange={(c) => { setVal(String(c)); commit(String(c)); }} />}
      </div>
      <p className="font-mono text-[10px] text-muted-foreground">{s.key}{s.kind === "number" && s.min != null && ` · ${s.min}–${s.max}`}</p>
      {s.prod_hint && <p className="flex items-center gap-1 text-[11px] text-amber-800 dark:text-amber-300"><Info className="h-3 w-3 shrink-0" />{t("adminSet.prod")}: {s.prod_hint}</p>}
      {s.kind !== "bool" && <div className="flex items-start gap-2">
        {s.kind === "enum" ? (
          <select id={`set-${s.key}`} data-testid="setting-input" value={val} onChange={(e) => setVal(e.target.value)} className="min-w-0 flex-1 rounded-lg border bg-card px-2 py-1.5 text-sm">
            {s.options?.map((o) => <option key={o} value={o}>{o}</option>)}</select>
        ) : s.kind === "json" ? (
          <textarea id={`set-${s.key}`} data-testid="setting-input" value={val} onChange={(e) => setVal(e.target.value)} rows={4} spellCheck={false} className="min-w-0 flex-1 rounded-lg border bg-card px-2 py-1.5 font-mono text-[11px]" />
        ) : (
          <input id={`set-${s.key}`} data-testid="setting-input" inputMode={s.kind === "number" ? "decimal" : undefined} value={val} onChange={(e) => setVal(e.target.value)} className="min-w-0 flex-1 rounded-lg border bg-card px-2 py-1.5 text-sm" />
        )}
        {dirty && <>
          <button data-testid="setting-save" aria-label={t("admin.save")} disabled={busy} onClick={() => commit(val)} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground animate-in zoom-in">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}</button>
          <button aria-label={t("adminSet.undo")} onClick={() => setVal(fmt(s, s.value))} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border"><RotateCcw className="h-3.5 w-3.5" /></button>
        </>}
      </div>}
    </div>
  );
}

// Per-category auto-approve: inherit (global) / on / off for each profession.
function CategorySwitches({ s }: { s: Spec }) {
  const { t, i18n } = useTranslation(); const ta = i18n.language?.startsWith("ta"); const qc = useQueryClient();
  const cats = useQuery({ queryKey: ["admin-categories"], queryFn: async () => {
    const { data, error } = await supabase.from("taxonomy_nodes").select("slug,name_i18n").eq("kind", "category").like("slug", "professionals--%").order("sort");
    if (error) throw error; return data as { slug: string; name_i18n: { en: string; ta?: string } }[];
  } });
  const map = (s.value ?? {}) as Record<string, boolean>;
  const set = async (slug: string, v: "inherit" | "on" | "off") => {
    const next = { ...map }; if (v === "inherit") delete next[slug]; else next[slug] = v === "on";
    try { await saveSetting(s.key, next); toast.success(t("admin.saved")); await qc.invalidateQueries({ queryKey: ["admin-settings"] }); } catch (e) { toast.error((e as Error).message); }
  };
  return (
    <div data-testid="auto-approve-cats" className="card-soft h-full space-y-2 p-3">
      <p className="text-sm font-medium">{(ta && s.label_i18n.ta) || s.label_i18n.en}</p>
      <p className="text-[11px] text-muted-foreground">{t("adminSet.catHint")}</p>
      {cats.data?.map((c) => {
        const cur = c.slug in map ? (map[c.slug] ? "on" : "off") : "inherit";
        return (
          <div key={c.slug} data-testid="auto-cat" data-cat={c.slug} data-state={cur} className="flex items-center justify-between gap-2 text-xs">
            <span className="font-medium">{(ta && c.name_i18n.ta) || c.name_i18n.en}</span>
            <div role="radiogroup" className="flex rounded-lg bg-muted p-0.5">
              {(["inherit", "on", "off"] as const).map((v) => <button key={v} role="radio" aria-checked={cur === v} data-testid={`auto-cat-${v}`} onClick={() => set(c.slug, v)}
                className={`rounded-md px-2 py-1 font-semibold ${cur === v ? "bg-card shadow" : "text-muted-foreground"}`}>{t(`adminSet.cat.${v}`)}</button>)}
            </div>
          </div>);
      })}
    </div>
  );
}
