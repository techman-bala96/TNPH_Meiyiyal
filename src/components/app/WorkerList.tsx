import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Award, BadgeCheck, Briefcase, MapPin, MessageSquareText, SearchX, Star } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentLocation } from "@/features/location/useCurrentLocation";
import { initials } from "@/features/profile/useProfile";
import { RequestSheet } from "@/features/consult/RequestSheet";
import type { Rates } from "@/features/consult/api";

export type WorkerCard = { id: string; display_name: string; photo_url: string | null; rating: number; feedback_count: number; rewards_count: number; years_experience: number;
  primary_node: string; specialty: { en: string; ta?: string } | null; is_online: boolean; distance_km: number; district_slug: string | null; district_name: { en: string; ta?: string } | null;
  is_busy?: boolean; rates?: Rates };

export function WorkerList({ node, nodeLabel, tile, where }: { node: string; nodeLabel: string; tile: string; where: string }) {
  const { t, i18n } = useTranslation(); const ta = i18n.language?.startsWith("ta");
  const { data: loc } = useCurrentLocation();
  const [all, setAll] = useState(false);
  const q = useQuery({
    queryKey: ["search-workers", node, loc?.lat, loc?.lng, all], enabled: !!loc,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("search_workers", { _node: node, _lat: loc!.lat, _lng: loc!.lng, _all: all, _limit: all ? 200 : 50 });
      if (error) throw error; return data as unknown as WorkerCard[];
    },
  });
  const rows = q.data ?? [];
  const dn = (d: { en: string; ta?: string } | null) => (d ? (ta && d.ta) || d.en : "—");
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
    <li data-testid="worker-card" data-name={w.display_name} data-online={w.is_online} data-busy={!!w.is_busy} role="button" tabIndex={0}
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
          <span className="flex items-center gap-0.5 text-muted-foreground"><Award className="h-3.5 w-3.5" />{w.rewards_count}</span>
          <span className="flex items-center gap-0.5 text-muted-foreground"><MessageSquareText className="h-3.5 w-3.5" />{w.feedback_count}</span>
        </div>
      </div>
    </li>
  </>);
}
