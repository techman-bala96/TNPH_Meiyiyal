import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { I18n } from "@/features/rewards/types";
export type Tag = I18n & { key: string };
export type FeedbackCfg = { tags: { positive: Tag[]; negative: Tag[]; complaint: Tag[] }; good_rating_min: number; flag_clear_good_sessions: number; block_negatives: number; block_days: number };
export function useFeedbackConfig() {
  return useQuery({ queryKey: ["feedback-config"], staleTime: 600_000, queryFn: async () => { const { data, error } = await supabase.rpc("feedback_config"); if (error) throw error; return data as unknown as FeedbackCfg; } });
}
