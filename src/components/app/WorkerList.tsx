import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Award, BadgeCheck, Briefcase, MapPin, MessageSquareText, SearchX, Star, X } from "lucide-react";
import { useTaxonomy, nodeName } from "@/features/taxonomy/useTaxonomy";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentLocation } from "@/features/location/useCurrentLocation";
import { initials } from "@/features/profile/useProfile";
import { RequestSheet } from "@/features/consult/RequestSheet";
import type { Rates } from "@/features/consult/api";
import { BadgeRow } from "@/features/rewards/RewardIcon";
import type { Reward } from "@/features/rewards/types";

export type WorkerCard = { id: string; display_name: string; photo_url: string | null; rating: number; feedback_count: number; rewards_count: number; years_experience: number;
  primary_node: string; specialty: { en: string; ta?: string } | null; is_online: boolean; distance_km: number; district_slug: string | null; district_name: { en: string; ta?: string } | null;
  is_busy?: boolean; rates?: Rates; badges?: Reward[] };

export function WorkerList({ node, nodeLabel, tile, where }: { node: string; nodeLabel: string; tile: string; where: string }) {
  const { t, i18n } = useTranslation(); const ta = i18n.language?.startsWith("ta");
  const dn = (d: { en: string; ta?: string } | null) => (d ? (ta && d.ta) || d.en : "—");
  const { data: loc } = useCurrentLocation(); const tax = useTaxonomy();
  // filters live in the URL so the voice agent (and deep links) can set them
  const [sp, setSp] = useSearchParams();
  const district = sp.get("district"); const all = sp.get("all") === "1" || !!district;
  const near = sp.get("near")?.split(","); const center = near && near.length >= 2 ? { lat: Number(near[0]), lng: Number(near[1]), label: near.slice(2).join(",") } : null;
  const km = sp.get("km") ? Number(sp.get("km")) : null; const online = sp.get("online") === "1"; const sort = sp.get("sort");
  const xn = (sp.get("xn") ?? "").split(",").filter(Boolean); const xw = (sp.get("xw") ?? "").split(",").filter(Boolean);
  const setAll = (v: boolean) => { const n = new URLSearchParams(sp); if (v) n.set("all", "1"); else { n.delete("all"); n.delete("district"); } setSp(n, { replace: true }); };
  const drop = (keys: string[], val?: string) => { const n = new URLSearchParams(sp); for (const k of keys) {
    if (val && (k === "xn" || k === "xw")) { const rest = (n.get(k) ?? "").split(",").filter((x) => x && x !== val); if (rest.length) n.set(k, rest.join(",")); else n.delete(k); } else n.delete(k); }
    setSp(n, { replace: true }); };
  const lat = center?.lat ?? loc?.lat; const lng = center?.lng ?? loc?.lng;
  const q = useQuery({
    queryKey: ["search-workers", node, lat, lng, all, km], enabled: lat != null,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("search_workers", { _node: node, _lat: lat!, _lng: lng!, _all: all, _limit: all ? 200 : 50, _radius_km: km ?? 50 });
      if (error) throw error; return data as unknown as WorkerCard[];
    },
  });
  let rows = (q.data ?? []).filter((w) => (!online || w.is_online) && (!district || w.district_slug === district) && (!km || w.distance_km <= km)
    && !xn.some((x) => w.primary_node === x || w.primary_node.startsWith(x + "--")) && !xw.some((x) => w.display_name.toLowerCase().includes(x.toLowerCase())));
  if (sort === "rating") rows = [...rows].sort((a, b) => Number(b.rating) - Number(a.rating) || b.feedback_count - a.feedback_count);
  else if (sort === "experience") rows = [...rows].sort((a, b) => b.years_experience - a.years_experience);
  else if (sort === "distance") rows = [...rows].sort((a, b) => a.distance_km - b.distance_km);
  const tn = (slug: string) => { const n = tax.data?.find((x) => x.slug === slug); return n ? nodeName(n, ta ? "ta" : "en") : slug; };
  const chips: { key: string; label: string; keys: string[]; val?: string }[] = [
    ...(online ? [{ key: "online", label: t("filters.online"), keys: ["online"] }] : []),
    ...(center ? [{ key: "near", label: t("filters.near", { place: center.label }), keys: ["near"] }] : []),
    ...(district ? [{ key: "district", label: t("filters.district", { name: dn((q.data ?? []).find((w) => w.district_slug === district)?.district_name ?? { en: district }) }), keys: ["district"] }] : []),
    ...(km ? [{ key: "km", label: t("filters.km", { km }), keys: ["km"] }] : []),
    ...(sort ? [{ key: "sort", label: t(`filters.sort.${sort}`), keys: ["sort"] }] : []),
    ...xn.map((x) => ({ key: `xn:${x}`, label: t("filters.not", { name: tn(x) }), keys: ["xn"], val: x })),
    ...xw.map((x) => ({ key: `xw:${x}`, label: t("filters.not", { name: x }), keys: ["xw"], val: x })),
  ];
  const groups = all ? Object.entries(rows.reduce<Record<string, WorkerCard[]>>((m, r) => ((m[dn(r.district_name)] ??= []).push(r), m), {})) : [];

  return (
    <section className="space-y-3" data-testid="worker-list-section">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">{all ? t("list.allTn") : t("list.nearYou")} <span data-testid="worker-count" className="text-muted-foreground">· {rows.length}</span></h2>
        <div className="flex rounded-full bg-muted p-0.5 text-xs font-semibold">
          <button data-testid="list-near" onClick={() => setAll(false)} className={`rounded-full px-3 py-1.5 transition ${!all ? "bg-card shadow" : "text-muted-foreground"}`}>{t("list.near")}</button>
          <button data-testid="list-all" onClick={() => setAll(true)} className={`rounded-full px-3 py-1.5 transition ${all ? "bg-card shadow" : "text-muted-foreground"}`}>{t("list.showAll")}</button>
        </div>
      </div>
      {chips.length > 0 && (
        <div className="flex flex-wrap gap-1.5" data-testid="filter-chips">
          {chips.map((c) => (
            <button key={c.key} data-testid="filter-chip" data-key={c.key} onClick={() => drop(c.keys, c.val)}
              className="flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary transition hover:bg-primary/20 animate-in fade-in zoom-in-95">
              {c.label}<X className="h-3 w-3" /></button>))}
        </div>)}
      {q.isLoading && [0, 1, 2].map((i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-muted" />)}
      {!q.isLoading && rows.length === 0 && (
        <div data-testid="worker-empty" className="card-soft flex flex-col items-center gap-3 p-6 text-center animate-in fade-in">
          <span className={`grid h-16 w-16 place-items-center rounded-full ${tile}`}><SearchX className="h-8 w-8" /></span>
          <h3 className="font-semibold">{t("browse.emptyTitle", { name: nodeLabel })}</h3>
          <p className="text-sm text-muted-foreground">{t("browse.emptyBody", { place: where })}</p>
          <div className="flex gap-4">
            {!all && <button onClick={() => setAll(true)} className="text-sm font-semibold text-primary">{t("list.showAll")}</button>}
            <Link to="/location" state={{ from: `/browse/${node}` }} className="text-sm font-semibold text-primary">{t("location.change")}</Link>
          </div>
        </div>
      )}
      {all ? groups.map(([d, list]) => (
        <div key={d} className="space-y-2" data-testid="district-group" data-district={d}>
          <h3 className="sticky top-0 z-10 flex items-center gap-1.5 bg-background/90 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur"><MapPin className="h-3.5 w-3.5" />{d} · {list.length}</h3>
          <ul className="space-y-2">{list.map((w) => <Card key={w.id} w={w} />)}</ul>
        </div>
      )) : <ul className="space-y-2">{rows.map((w) => <Card key={w.id} w={w} />)}</ul>}
    </section>
  );
}

function Card({ w }: { w: WorkerCard }) {
  const { t, i18n } = useTranslation(); const ta = i18n.language?.startsWith("ta");
  const spec = w.specialty ? (ta && w.specialty.ta) || w.specialty.en : "";
  const [open, setOpen] = useState(false);
  return (<>
    <RequestSheet w={{ ...w, spec }} open={open} onOpenChange={setOpen} />
    <li data-testid="worker-card" data-id={w.id} data-name={w.display_name} data-online={w.is_online} data-busy={!!w.is_busy} role="button" tabIndex={0}
      onClick={() => setOpen(true)} onKeyDown={(e) => e.key === "Enter" && setOpen(true)}
      className="card-soft flex cursor-pointer gap-3 p-3 transition hover:-translate-y-0.5 hover:shadow-lg animate-in fade-in slide-in-from-bottom-1">
      <div className="relative shrink-0">
        <Avatar className="h-16 w-16 rounded-2xl">
          {w.photo_url && <AvatarImage src={w.photo_url} alt="" className="object-cover" />}
          <AvatarFallback className="rounded-2xl bg-primary/10 font-semibold text-primary">{initials(w.display_name)}</AvatarFallback>
        </Avatar>
        <span data-testid="online-dot" aria-label={w.is_online ? t("list.online") : t("list.offline")}
          className={`absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full ring-2 ring-card ${w.is_online ? "bg-emerald-500" : "bg-muted-foreground/40"}`}>
          {w.is_online && <span className="absolute inset-0 animate-ping rounded-full bg-emerald-500/60" />}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="flex min-w-0 items-center gap-1 font-semibold"><span className="truncate">{w.display_name}</span><BadgeCheck className="h-4 w-4 shrink-0 text-primary" /></p>
          <span data-testid="distance" className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold">{w.distance_km.toFixed(1)} km</span>
        </div>
        <p className="truncate text-xs text-muted-foreground">{spec}{w.is_busy && <span className="ml-1 font-semibold text-amber-600">· {t("consult.busy")}</span>}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <span className="flex items-center gap-0.5 font-semibold" data-testid="rating"><Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />{w.feedback_count > 0 ? Number(w.rating).toFixed(1) : t("list.new")}</span>
          <span className="flex items-center gap-0.5 text-muted-foreground"><Briefcase className="h-3.5 w-3.5" />{t("list.yrs", { count: w.years_experience })}</span>
          <span className="flex items-center gap-0.5 text-muted-foreground"><Award className="h-3.5 w-3.5" /><span data-testid="rewards-count">{w.rewards_count}</span></span>
          <BadgeRow badges={w.badges ?? []} lang={i18n.language ?? "en"} />
          <span className="flex items-center gap-0.5 text-muted-foreground"><MessageSquareText className="h-3.5 w-3.5" /><span data-testid="feedback-count">{w.feedback_count}</span></span>
        </div>
      </div>
    </li>
  </>);
}
