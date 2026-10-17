import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { Reward } from "./types";
export type Standing = { worker_id: string; flag_active: boolean; flag_good_needed: number; flag_reason: string | null; blocked: boolean; blocked_until: string | null;
  block_reason: string | null; negatives: number; block_negatives: number; rewards: Reward[] };
export function useStanding() {
  const { user } = useAuth();
  return useQuery({ queryKey: ["standing", user?.id], enabled: !!user, queryFn: async () => { const { data, error } = await supabase.rpc("my_worker_standing"); if (error) throw error; return data as unknown as Standing | null; } });
}
