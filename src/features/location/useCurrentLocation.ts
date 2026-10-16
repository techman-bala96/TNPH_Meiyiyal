import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type CurrentLocation = {
  id: string; district_slug: string | null; district_name: { en: string; ta?: string } | null;
  area_id: number | null; area_name: string | null; area_name_ta: string | null; lat: number; lng: number; source: string;
};

export function useCurrentLocation() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["current-location", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("my_current_location");
      if (error) throw error;
      return (data?.[0] ?? null) as CurrentLocation | null;
    },
  });
}

export function useSaveLocation() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return async (p: { lat: number; lng: number; source: "gps" | "list" | "search" | "pin"; district: string; area: number | null; address?: string }) => {
    const { error } = await supabase.rpc("set_current_location", {
      _lat: p.lat, _lng: p.lng, _source: p.source, _district: p.district, _area: p.area ?? undefined, _address: p.address,
    });
    if (error) throw error;
    await qc.invalidateQueries({ queryKey: ["current-location", user?.id] });
  };
}

export function placeLabel(l: { area_name: string | null; area_name_ta: string | null; district_name: { en: string; ta?: string } | null } | null, ta: boolean) {
  if (!l) return "";
  const d = l.district_name ? (ta && l.district_name.ta) || l.district_name.en : "";
  const a = (ta && l.area_name_ta) || l.area_name;
  return a && a !== d ? `${a}, ${d}` : d;
}
