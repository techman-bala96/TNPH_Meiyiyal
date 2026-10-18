import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { downloadCsv } from "./csv";

type Row = { district_slug: string | null; name_i18n: { en: string; ta?: string }; sort: number; total: number; submitted: number; pending: number; approved: number; rejected: number;
  doctor: number; veterinary: number; lawyer: number; engineer: number };
const PROFS = ["all", "doctor", "veterinary", "lawyer", "engineer"] as const;
const STATS = ["all", "submitted", "pending", "approved", "rejected"] as const;
const STATUS_COLS = ["submitted", "pending", "approved", "rejected"] as const;
const PROF_COLS = ["doctor", "veterinary", "lawyer", "engineer"] as const;

export function DistrictsView() {
  const { t, i18n } = useTranslation(); const ta = i18n.language?.startsWith("ta");
  const [prof, setProf] = useState<(typeof PROFS)[number]>("all"); const [status, setStatus] = useState<(typeof STATS)[number]>("all");
  const [q, setQ] = useState(""); const [hideZero, setHideZero] = useState(false); const [sort, setSort] = useState<"name" | "total">("name");
  const data = useQuery({ queryKey: ["admin-districts", prof, status], queryFn: async () => {
    const { data, error } = await supabase.rpc("admin_professionals_by_district", { _profession: prof, _status: status }); if (error) throw error; return data as unknown as Row[];
  } });
  const name = (r: Row) => (ta && r.name_i18n.ta) || r.name_i18n.en;
  const rows = useMemo(() => {
    let l = (data.data ?? []).filter((r) => (!q || (r.name_i18n.en + " " + (r.name_i18n.ta ?? "")).toLowerCase().includes(q.toLowerCase())) && (!hideZero || Number(r.total) > 0));
    if (sort === "total") l = [...l].sort((a, b) => Number(b.total) - Number(a.total));
    return l;
  }, [data.data, q, hideZero, sort]);
  const sum = (k: keyof Row) => rows.reduce((s, r) => s + Number(r[k] ?? 0), 0);
  const exportCsv = () => downloadCsv(`professionals-by-district-${prof}-${status}-${new Date().toISOString().slice(0, 10)}.csv`, [
    ["district", "district_ta", "total", ...STATUS_COLS, ...PROF_COLS],
    ...rows.map((r) => [r.name_i18n.en, r.name_i18n.ta ?? "", r.total, ...STATUS_COLS.map((k) => r[k]), ...PROF_COLS.map((k) => r[k])]),
    ["TOTAL", "", sum("total"), ...STATUS_COLS.map((k) => sum(k)), ...PROF_COLS.map((k) => sum(k))],
  ]);
  const chip = (on: boolean) => `tap shrink-0 rounded-xl px-3 text-xs font-semibold ${on ? "bg-card shadow" : "text-muted-foreground"}`;
  return (
    <div className="space-y-3" data-testid="districts-view">
      <p className="text-xs text-muted-foreground">{t("districts.hint")}</p>
      <div className="grid gap-2 md:grid-cols-2">
        <div role="radiogroup" aria-label={t("districts.profession")} className="flex gap-1 overflow-x-auto rounded-2xl bg-muted p-1 [scrollbar-width:none]">
          {PROFS.map((p) => <button key={p} role="radio" aria-checked={prof === p} data-testid={`districts-prof-${p}`} onClick={() => setProf(p)} className={chip(prof === p)}>{t(`districts.p.${p}`)}</button>)}</div>
        <div role="radiogroup" aria-label={t("districts.status")} className="flex gap-1 overflow-x-auto rounded-2xl bg-muted p-1 [scrollbar-width:none]">
          {STATS.map((s) => <button key={s} role="radio" aria-checked={status === s} data-testid={`districts-status-${s}`} onClick={() => setStatus(s)} className={chip(status === s)}>{t(`districts.s.${s}`)}</button>)}</div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input data-testid="districts-search" aria-label={t("districts.search")} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("districts.search")} className="min-w-0 flex-1 rounded-xl border bg-card px-3 py-2 text-sm" />
        <label className="flex items-center gap-1 text-xs"><input data-testid="districts-hide-zero" type="checkbox" checked={hideZero} onChange={(e) => setHideZero(e.target.checked)} />{t("districts.hideZero")}</label>
        <select aria-label={t("districts.sort")} value={sort} onChange={(e) => setSort(e.target.value as "name" | "total")} className="rounded-xl border bg-card px-2 py-2 text-xs">
          <option value="name">{t("districts.sortName")}</option><option value="total">{t("districts.sortTotal")}</option></select>
        <button data-testid="districts-csv" onClick={exportCsv} disabled={!rows.length} className="flex items-center gap-1 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-40"><Download className="h-3.5 w-3.5" />CSV</button>
      </div>
      {data.isLoading && <div className="h-40 animate-pulse rounded-2xl bg-muted" />}
      {data.error && <p className="text-sm text-destructive">{(data.error as Error).message}</p>}
      {data.data && (
        <div className="overflow-x-auto rounded-2xl border">
          <table data-testid="districts-table" className="w-full min-w-[640px] text-xs tabular-nums">
            <caption className="sr-only">{t("districts.caption")}</caption>
            <thead className="sticky top-0 bg-muted/80 backdrop-blur"><tr className="text-left">
              <th scope="col" className="p-2">{t("districts.district")}</th>
              <th scope="col" className="p-2 text-right">{t("districts.total")}</th>
              {STATUS_COLS.map((k) => <th key={k} scope="col" className="p-2 text-right">{t(`districts.s.${k}`)}</th>)}
              {PROF_COLS.map((k) => <th key={k} scope="col" className="p-2 text-right">{t(`districts.p.${k}`)}</th>)}
            </tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.district_slug ?? "none"} data-testid="district-row" data-slug={r.district_slug ?? ""} data-total={r.total} className={`border-t ${Number(r.total) === 0 ? "text-muted-foreground" : ""}`}>
                <th scope="row" className="p-2 text-left font-medium">{name(r)}</th>
                <td className="p-2 text-right font-semibold">{r.total}</td>
                {STATUS_COLS.map((k) => <td key={k} data-col={k} className="p-2 text-right">{r[k]}</td>)}
                {PROF_COLS.map((k) => <td key={k} data-col={k} className="p-2 text-right">{r[k]}</td>)}
              </tr>))}</tbody>
            <tfoot><tr data-testid="districts-total" className="border-t bg-muted/50 font-semibold">
              <th scope="row" className="p-2 text-left">{t("districts.allDistricts", { n: rows.length })}</th>
              <td className="p-2 text-right">{sum("total")}</td>
              {STATUS_COLS.map((k) => <td key={k} className="p-2 text-right">{sum(k)}</td>)}
              {PROF_COLS.map((k) => <td key={k} className="p-2 text-right">{sum(k)}</td>)}
            </tr></tfoot>
          </table>
        </div>)}
      <p className="text-[11px] text-muted-foreground">{t("districts.note")}</p>
    </div>
  );
}
