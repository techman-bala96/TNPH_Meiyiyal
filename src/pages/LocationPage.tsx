import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useLocation as useRouterLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ChevronRight, Crosshair, Loader2, MapPin, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { LangToggle } from "@/components/app/LangToggle";
import { Button } from "@/components/ui/button";
import districtsData from "@/features/location/districts.json";
import { getBrowserPosition, reverseGeocode, type ResolvedPlace } from "@/features/location/geocoding";
import { useCurrentLocation, useSaveLocation } from "@/features/location/useCurrentLocation";

type District = { slug: string; name: { en: string; ta?: string }; lat: number; lng: number; sort: number };
type Area = { id: number; district_slug: string; name: string; name_ta: string | null; sort: number };
const DISTRICTS = (districtsData as District[]).slice().sort((a, b) => a.sort - b.sort);

export default function LocationPage() {
  const { t, i18n } = useTranslation();
  const ta = i18n.language?.startsWith("ta");
  const nav = useNavigate();
  const from = (useRouterLocation().state as { from?: string } | null)?.from ?? "/";
  const current = useCurrentLocation();
  const save = useSaveLocation();
  const [q, setQ] = useState("");
  const [district, setDistrict] = useState<District | null>(null);
  const [gps, setGps] = useState<{ lat: number; lng: number; place: ResolvedPlace } | null>(null);
  const [busy, setBusy] = useState<"gps" | "save" | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const areas = useQuery({
    queryKey: ["tn-areas"],
    staleTime: Infinity,
    queryFn: async () => {
      const { data, error } = await supabase.from("tn_areas").select("id,district_slug,name,name_ta,sort").order("sort");
      if (error) throw error;
      return data as Area[];
    },
  });
  const dName = (d: District) => (ta && d.name.ta) || d.name.en;
  const aName = (a: Area) => (ta && a.name_ta) || a.name;
  const byDistrict = useMemo(() => Object.fromEntries(DISTRICTS.map((d) => [d.slug, d])), []);

  const needle = q.trim().toLowerCase();
  const match = (s?: string | null) => !!s && s.toLowerCase().includes(needle);
  const distList = needle ? DISTRICTS.filter((d) => match(d.name.en) || match(d.name.ta)) : DISTRICTS;
  const areaHits = needle ? (areas.data ?? []).filter((a) => match(a.name) || match(a.name_ta)).slice(0, 20) : [];
  const districtAreas = district ? (areas.data ?? []).filter((a) => a.district_slug === district.slug) : [];

  const done = () => nav(from === "/location" ? "/" : from, { replace: true });
  async function persist(p: Parameters<typeof save>[0]) {
    setBusy("save"); setErr(null);
    try { await save(p); done(); } catch { setErr(t("location.saveError")); } finally { setBusy(null); }
  }
  async function useGps() {
    setBusy("gps"); setErr(null); setGps(null);
    try {
      const pos = await getBrowserPosition();
      const place = await reverseGeocode(pos.lat, pos.lng);
      if (!place) throw new Error("none");
      setGps({ ...pos, place });
    } catch (e) {
      setErr((e as GeolocationPositionError)?.code === 1 ? t("location.denied") : t("location.gpsError"));
    } finally { setBusy(null); }
  }
  const pickArea = (a: Area) => {
    const d = byDistrict[a.district_slug];
    persist({ lat: d.lat, lng: d.lng, source: needle ? "search" : "list", district: d.slug, area: a.id });
  };
  const pickWholeDistrict = (d: District) => persist({ lat: d.lat, lng: d.lng, source: "list", district: d.slug, area: null });

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col bg-background">
      <header className="sticky top-0 z-10 space-y-3 bg-background/95 px-4 pb-3 pt-4 backdrop-blur">
        <div className="flex items-center gap-2">
          {(district || current.data) && (
            <button data-testid="loc-back" aria-label={t("auth.back")} className="tap -ml-2 grid w-11 place-items-center rounded-full"
              onClick={() => (district ? setDistrict(null) : done())}><ArrowLeft className="h-5 w-5" /></button>
          )}
          <h1 className="flex-1 text-lg font-bold">{t("location.title")}</h1>
          <LangToggle />
        </div>
        <label className="flex h-11 items-center gap-2 rounded-xl border bg-card px-3 focus-within:ring-2 focus-within:ring-primary/40">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input data-testid="loc-search" value={q} onChange={(e) => { setQ(e.target.value); setDistrict(null); }}
            placeholder={t("location.searchPlaceholder")} className="h-full flex-1 bg-transparent text-sm outline-none" />
        </label>
      </header>

      <div className="flex-1 space-y-4 px-4 pb-8">
        <button data-testid="btn-use-gps" onClick={useGps} disabled={!!busy}
          className="tap card-soft flex w-full items-center gap-3 p-3 text-left text-primary">
          {busy === "gps" ? <Loader2 className="h-5 w-5 animate-spin" /> : <Crosshair className="h-5 w-5" />}
          <span className="flex-1"><span className="block font-semibold">{t("location.useCurrent")}</span>
            <span className="block text-xs text-muted-foreground">{busy === "gps" ? t("location.detecting") : t("location.useCurrentHint")}</span></span>
          <ChevronRight className="h-4 w-4" />
        </button>

        {gps && (
          <section data-testid="gps-result" className="card-soft space-y-3 border border-primary/30 p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{t("location.detected")}</p>
            <p className="flex items-start gap-2 font-semibold"><MapPin className="mt-0.5 h-4 w-4 text-primary" />
              <span data-testid="gps-place">{[ (ta && gps.place.areaNameTa) || gps.place.areaName, (ta && gps.place.districtName.ta) || gps.place.districtName.en ].filter(Boolean).join(", ")}</span></p>
            <Button data-testid="btn-confirm-gps" className="tap w-full rounded-xl" disabled={!!busy}
              onClick={() => persist({ lat: gps.lat, lng: gps.lng, source: "gps", district: gps.place.districtSlug, area: gps.place.areaId })}>
              {busy === "save" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{t("location.confirm")}
            </Button>
          </section>
        )}
        {err && <p data-testid="loc-error" role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{err}</p>}

        {district ? (
          <section>
            <nav data-testid="loc-breadcrumb" className="mb-2 flex items-center gap-1 text-xs text-muted-foreground">
              <button className="underline" onClick={() => setDistrict(null)}>{t("location.allDistricts")}</button>
              <ChevronRight className="h-3 w-3" /><span className="font-medium text-foreground">{dName(district)}</span>
            </nav>
            <ul className="card-soft divide-y">
              <li><button data-testid="area-whole" onClick={() => pickWholeDistrict(district)} className="tap flex w-full items-center gap-3 px-4 text-left text-sm font-medium text-primary">
                {t("location.wholeDistrict", { name: dName(district) })}</button></li>
              {districtAreas.map((a) => (
                <li key={a.id}><button data-testid="area-item" onClick={() => pickArea(a)} disabled={!!busy}
                  className="tap flex w-full items-center gap-3 px-4 text-left text-sm"><MapPin className="h-4 w-4 text-muted-foreground" />{aName(a)}</button></li>
              ))}
            </ul>
          </section>
        ) : (
          <>
            {areaHits.length > 0 && (
              <section>
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("location.areas")}</h2>
                <ul className="card-soft divide-y">
                  {areaHits.map((a) => (
                    <li key={a.id}><button data-testid="area-hit" onClick={() => pickArea(a)} disabled={!!busy}
                      className="tap flex w-full items-center gap-3 px-4 text-left text-sm"><MapPin className="h-4 w-4 text-muted-foreground" />
                      <span className="flex-1">{aName(a)}</span><span className="text-xs text-muted-foreground">{dName(byDistrict[a.district_slug])}</span></button></li>
                  ))}
                </ul>
              </section>
            )}
            <section>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("location.districts")}</h2>
              {distList.length === 0 && areaHits.length === 0 ? <p data-testid="loc-empty" className="text-sm text-muted-foreground">{t("location.noResults")}</p> : (
                <ul className="card-soft divide-y">
                  {distList.map((d) => (
                    <li key={d.slug}><button data-testid={`district-${d.slug}`} onClick={() => setDistrict(d)}
                      className="tap flex w-full items-center gap-3 px-4 text-left text-sm"><span className="flex-1">{dName(d)}</span><ChevronRight className="h-4 w-4 text-muted-foreground" /></button></li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
