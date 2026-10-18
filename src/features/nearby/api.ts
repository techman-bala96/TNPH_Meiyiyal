import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useProfile, useUpdateProfile, type Prefs } from "@/features/profile/useProfile";
import type { Mode, Rates } from "@/features/consult/api";

/** M10 RPCs are newer than the generated DB types, so this feature uses the untyped client view (same as push). */

export type I18n = { en: string; ta?: string };
export type SearchView = {
  id: string; status: "searching" | "matched" | "exhausted" | "cancelled"; reason: "cap" | "none_left" | "no_credits" | null; node: string; mode: Mode; all_tn: boolean;
  attempts: number; round_attempts: number; max: number; session_id: string | null; max_rate: number;
  tried: { id: string; name: string; photo: string | null; distance_km: number | null }[];
  current: { request_id: string; expires_at: string; rate: number; worker: { id: string; name: string; photo: string | null; specialty: I18n | null; distance_km: number | null } } | null;
};
export type SuggestedWorker = { id: string; display_name: string; photo_url: string | null; rating: number; feedback_count: number; years_experience: number; primary_node: string;
  specialty: I18n | null; distance_km: number; rates: Rates; badge_tier: string | null };
export type WorkerMessage = { id: string; role: "user" | "worker"; other_name: string; other_photo: string | null; worker_id: string; body: string | null; voice_path: string | null;
  voice_seconds: number | null; credits: number; status: "sent" | "read" | "responded" | "refunded"; created_at: string; responded_at: string | null; reserved_until: string | null;
  refund_at: string | null; muted: boolean };
export type SessionState = { status: "active" | "ended"; credits_used: number; mode: Mode; rate: number; balance: number | null; minutes_left: number | null; end_reason: string | null;
  paused: boolean; paused_at: string | null; pause_side: "user" | "worker" | "both" | null; other_here: boolean; resume_ask: boolean; my_answer: boolean | null; other_answer: boolean | null;
  low_balance: boolean; refunded: number };

export const errText = (e: { message?: string } | null | undefined) => e?.message ?? "";
export const tx = (v: I18n | null | undefined, lang: string) => (v ? (lang.startsWith("ta") && v.ta) || v.en : "");

/** Nearby prefs live in profiles.prefs (synced across devices). Auto request is ON unless the user turned it off. */
export function useNearbyPrefs() {
  const { data: p } = useProfile(); const update = useUpdateProfile();
  const prefs: Prefs = p?.prefs ?? {};
  const save = async (patch: Partial<Prefs>) => { await update({ prefs: { ...(p?.prefs ?? {}), ...patch } }); };
  return { auto: prefs.auto_request !== false, mode: prefs.consult_mode ?? null, ready: !!p, save };
}

export function useMyMessages() {
  const { user } = useAuth();
  return useQuery({ queryKey: ["worker-messages", user?.id], enabled: !!user, refetchInterval: 20_000, queryFn: async () => {
    const { data, error } = await supabase.rpc("my_worker_messages"); if (error) throw error; return (data ?? []) as WorkerMessage[];
  } });
}

export async function fetchSuggestions(node: string, lat: number, lng: number, exclude: string[]): Promise<SuggestedWorker[]> {
  const { data, error } = await supabase.rpc("search_suggestions", { _node: node, _lat: lat, _lng: lng, _exclude: exclude, _n: 3 });
  if (error) return [];
  return (data ?? []) as SuggestedWorker[];
}
