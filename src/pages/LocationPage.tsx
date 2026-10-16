import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useLocation as useRouterLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Crosshair, Loader2, MapPin, Search, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { LangToggle } from "@/components/app/LangToggle";
import { Button } from "@/components/ui/button";
import districtsData from "@/features/location/districts.json";
import { getBrowserPosition, reverseGeocode, type ResolvedPlace } from "@/features/location/geocoding";
import { nominatimReverse, nominatimSearch, shortAddress, type NominatimPlace } from "@/features/location/nominatim";
import { createMap, type LatLng, type MapHandle } from "@/features/location/map";
import { useCurrentLocation, useSaveLocation } from "@/features/location/useCurrentLocation";

type District = { slug: string; name: { en: string; ta?: string }; lat: number; lng: number; sort: number };
type Area = { id: number; district_slug: string; name: string; name_ta: string | null; sort: number };
type Source = "gps" | "search" | "pin" | "list";
const DISTRICTS = (districtsData as District[]).slice().sort((a, b) => a.sort - b.sort);
const DEFAULT: LatLng = { lat: DISTRICTS[0].lat, lng: DISTRICTS[0].lng }; // Kanniyakumari
const ZOOM = 16;

export default function LocationPage() {
  const { t, i18n } = useTranslation();
  const ta = !!i18n.language?.startsWith("ta");
  const lang = ta ? "ta,en" : "en";
  const nav = useNavigate();
  const from = (useRouterLocation().state as { from?: string } | null)?.from ?? "/";
  const current = useCurrentLocation();
  const save = useSaveLocation();

  const mapEl = useRef<HTMLDivElement>(null);
  const map = useRef<MapHandle | null>(null);
  const [center, setCenter] = useState<LatLng | null>(null);
  const [moving, setMoving] = useState(false);
  const source = useRef<Source>("pin");
  const areaOverride = useRef<{ district: string; area: number | null } | null>(null);
  const [place, setPlace] = useState<ResolvedPlace | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [focus, setFocus] = useState(false);
  const [remote, setRemote] = useState<NominatimPlace[] | null>(null);
  const [searching, setSearching] = useState(false);

  const areas = useQuery({
    queryKey: ["tn-areas"], staleTime: Infinity,
    queryFn: async () => {
      const { data, error } = await supabase.from("tn_areas").select("id,district_slug,name,name_ta,sort").order("sort");
      if (error) throw error;
      return data as Area[];
    },
  });
  const byDistrict = useMemo(() => Object.fromEntries(DISTRICTS.map((d) => [d.slug, d])), []);
  const dName = (d: { en: string; ta?: string }) => (ta && d.ta) || d.en;

  async function locate(initial = false) {
    setLocating(true); setErr(null);
    try {
      const p = await getBrowserPosition();
      source.current = "gps"; areaOverride.current = null;
      map.current?.setCenter(p, ZOOM, !initial);
    } catch (e) {
      setErr((e as GeolocationPositionError)?.code === 1 ? t("location.denied") : t("location.gpsError"));
    } finally { setLocating(false); }
  }

  // mount map once
  useEffect(() => {
    if (!mapEl.current || map.current) return;
    const saved = current.data ? { lat: current.data.lat, lng: current.data.lng } : null;
    map.current = createMap(mapEl.current, saved ?? DEFAULT, saved ? ZOOM : 13, {
      onMoveStart: (byUser) => { if (byUser) { source.current = "pin"; areaOverride.current = null; } setMoving(true); },
      onMoveEnd: (c, byUser) => { if (byUser) { source.current = "pin"; areaOverride.current = null; } setMoving(false); setCenter(c); },
    });
    setCenter(map.current.getCenter());
    if (!saved) locate(true);
    return () => { map.current?.destroy(); map.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // resolve the pin (debounced; Nominatim queue enforces 1 req/s)
  useEffect(() => {
    if (!center) return;
    let live = true;
    setResolving(true);
    const id = setTimeout(async () => {
      const [near, rev] = await Promise.allSettled([reverseGeocode(center.lat, center.lng), nominatimReverse(center.lat, center.lng, lang)]);
      if (!live) return;
      setPlace(near.status === "fulfilled" ? near.value : null);
      setAddress(rev.status === "fulfilled" && rev.value ? shortAddress(rev.value) : null);
      setResolving(false);
    }, 700);
    return () => { live = false; clearTimeout(id); };
  }, [center, lang]);

  // seeded matches are local -> instant; Nominatim only on explicit submit (policy: no autocomplete)
  const needle = q.trim().toLowerCase();
  const m = (s?: string | null) => !!s && s.toLowerCase().includes(needle);
  const seededD = needle ? DISTRICTS.filter((d) => m(d.name.en) || m(d.name.ta)).slice(0, 4) : [];
  const seededA = needle ? (areas.data ?? []).filter((a) => m(a.name) || m(a.name_ta)).slice(0, 6) : [];
  useEffect(() => setRemote(null), [q]);

  async function submitSearch() {
    if (needle.length < 3) return;
    setSearching(true);
    try { setRemote(await nominatimSearch(q.trim(), lang)); } catch { setRemote([]); } finally { setSearching(false); }
  }
  function go(p: LatLng, override: { district: string; area: number | null } | null) {
    source.current = "search"; areaOverride.current = override;
    setFocus(false); setQ(""); setErr(null);
    (document.activeElement as HTMLElement | null)?.blur();
    map.current?.setCenter(p, ZOOM);
  }

  const shown = place && areaOverride.current
    ? (() => {
        const d = byDistrict[areaOverride.current!.district];
        const a = (areas.data ?? []).find((x) => x.id === areaOverride.current!.area);
        return { district: d.name, area: a ? (ta && a.name_ta) || a.name : null, slug: d.slug, areaId: a?.id ?? null };
      })()
    : place ? { district: place.districtName, area: (ta && place.areaNameTa) || place.areaName, slug: place.districtSlug, areaId: place.areaId } : null;

  async function confirm() {
    if (!center || !shown) return;
    setSaving(true); setErr(null);
    try {
      await save({ lat: center.lat, lng: center.lng, source: source.current, district: shown.slug, area: shown.areaId, address: address ?? undefined });
      nav(from === "/location" ? "/" : from, { replace: true });
    } catch { setErr(t("location.saveError")); } finally { setSaving(false); }
  }

  const showResults = focus && needle.length > 0;
  return (
    <main className="relative mx-auto h-dvh max-w-md overflow-hidden bg-muted">
      <div ref={mapEl} data-testid="map" className="absolute inset-0 z-0" />

      {/* fixed centre pin */}
      <div className="pointer-events-none absolute left-1/2 top-[42%] z-[500] -translate-x-1/2 -translate-y-full" data-testid="center-pin">
        {!moving && <div className="mb-1 whitespace-nowrap rounded-lg bg-foreground px-2.5 py-1 text-center text-[11px] font-medium text-background shadow">{t("location.pinHint")}</div>}
        <MapPin className={`mx-auto h-10 w-10 fill-primary text-white drop-shadow-lg transition-transform ${moving ? "-translate-y-2" : ""}`} strokeWidth={1.5} />
        <div className="mx-auto -mt-1 h-1.5 w-3 rounded-full bg-black/30" />
      </div>

      {/* top bar */}
      <header className="absolute inset-x-0 top-0 z-[600] space-y-2 p-3">
        <div className="flex items-center gap-2">
          {current.data && (
            <button data-testid="loc-back" aria-label={t("auth.back")} onClick={() => nav(from === "/location" ? "/" : from, { replace: true })}
              className="tap grid w-11 shrink-0 place-items-center rounded-full bg-card shadow"><ArrowLeft className="h-5 w-5" /></button>
          )}
          <form className="flex h-11 flex-1 items-center gap-2 rounded-xl bg-card px-3 shadow" onSubmit={(e) => { e.preventDefault(); submitSearch(); }}>
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input data-testid="loc-search" value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => setFocus(true)}
              enterKeyHint="search" placeholder={t("location.searchPlaceholder")} className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none" />
            {q && <button type="button" aria-label="clear" onClick={() => setQ("")}><X className="h-4 w-4 text-muted-foreground" /></button>}
          </form>
          <div className="shrink-0 rounded-full bg-card shadow"><LangToggle /></div>
        </div>

        {showResults && (
          <div data-testid="search-results" className="max-h-[55vh] overflow-y-auto rounded-2xl bg-card shadow-lg">
            <ul className="divide-y">
              {seededD.map((d) => (
                <li key={d.slug}><button data-testid={`district-${d.slug}`} onClick={() => go({ lat: d.lat, lng: d.lng }, { district: d.slug, area: null })}
                  className="tap flex w-full items-center gap-3 px-4 py-2 text-left text-sm"><MapPin className="h-4 w-4 text-primary" />
                  <span className="flex-1 font-medium">{dName(d.name)}</span><span className="text-xs text-muted-foreground">{t("location.district")}</span></button></li>
              ))}
              {seededA.map((a) => { const d = byDistrict[a.district_slug]; return (
                <li key={a.id}><button data-testid="area-hit" onClick={() => go({ lat: d.lat, lng: d.lng }, { district: d.slug, area: a.id })}
                  className="tap flex w-full items-center gap-3 px-4 py-2 text-left text-sm"><MapPin className="h-4 w-4 text-muted-foreground" />
                  <span className="flex-1">{(ta && a.name_ta) || a.name}</span><span className="text-xs text-muted-foreground">{dName(d.name)}</span></button></li>
              ); })}
              {remote?.map((r, i) => (
                <li key={`${r.lat},${r.lon},${i}`}><button data-testid="place-hit" onClick={() => go({ lat: +r.lat, lng: +r.lon }, null)}
                  className="tap flex w-full items-start gap-3 px-4 py-2 text-left text-sm"><Search className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0"><span className="block truncate font-medium">{r.name || r.display_name.split(",")[0]}</span>
                    <span className="block truncate text-xs text-muted-foreground">{r.display_name}</span></span></button></li>
              ))}
            </ul>
            {remote === null ? (
              <button data-testid="btn-search-places" onClick={submitSearch} disabled={needle.length < 3 || searching}
                className="tap flex w-full items-center justify-center gap-2 border-t px-4 text-sm font-medium text-primary disabled:text-muted-foreground">
                {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}{t("location.searchPlaces", { q: q.trim() })}
              </button>
            ) : remote.length === 0 && seededD.length + seededA.length === 0 ? (
              <p data-testid="loc-empty" className="p-4 text-sm text-muted-foreground">{t("location.noResults")}</p>
            ) : null}
          </div>
        )}
      </header>

      {/* bottom sheet */}
      <section data-testid="confirm-sheet" className="absolute inset-x-0 bottom-0 z-[600] rounded-t-3xl bg-card p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(0,0,0,.12)]">
        <button data-testid="btn-locate" onClick={() => locate()} aria-label={t("location.useCurrent")}
          className="tap absolute -top-14 right-3 flex items-center gap-1.5 rounded-full bg-card px-3 text-sm font-semibold text-primary shadow-lg">
          {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crosshair className="h-4 w-4" />}{t("location.locateMe")}
        </button>
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-muted" />
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{t("location.selected")}</p>
        <div className="mt-1 flex items-start gap-2">
          <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            {resolving || moving || !shown ? (
              <div className="space-y-2 py-1"><div className="h-4 w-2/3 animate-pulse rounded bg-muted" /><div className="h-3 w-1/2 animate-pulse rounded bg-muted" /></div>
            ) : (
              <>
                <p data-testid="sheet-place" className="font-semibold">{[shown.area, dName(shown.district)].filter((v, i, a) => v && a.indexOf(v) === i).join(", ")}</p>
                <p data-testid="sheet-address" className="line-clamp-2 text-xs text-muted-foreground">{address ?? t("location.addressUnavailable")}</p>
              </>
            )}
          </div>
        </div>
        {err && <p data-testid="loc-error" role="alert" className="mt-3 rounded-xl bg-destructive/10 p-2.5 text-xs text-destructive">{err}</p>}
        <Button data-testid="btn-confirm" className="tap mt-3 w-full rounded-xl text-base" disabled={!shown || resolving || moving || saving} onClick={confirm}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{t("location.confirm")}
        </Button>
      </section>
    </main>
  );
}
