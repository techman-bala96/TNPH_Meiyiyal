import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type Mode = "chat" | "voice" | "video";
export type Rates = Record<Mode, { rate: number; min_minutes: number } | null>;
export type Wallet = { balance: number; dev_test_credits: boolean };
export type ConsultRequest = { id: string; user_id: string; worker_id: string; worker_user_id: string; node_slug: string; mode: Mode; rate: number; min_minutes: number;
  status: "ringing" | "accepted" | "declined" | "timeout" | "cancelled"; user_name: string | null; session_id: string | null; created_at: string; expires_at: string };
export type SessionInfo = { id: string; role: "user" | "worker"; status: "active" | "ended"; mode: Mode; started_at: string; ended_at: string | null; credits_used: number;
  end_reason: string | null; node_slug: string; node_name: { en: string; ta?: string } | null; rates: Rates; other: { name: string; photo: string | null; user_id: string } };
export type Call = { id: string; session_id: string; mode: "voice" | "video"; caller: string; status: "ringing" | "active" | "declined" | "missed" | "ended"; created_at: string };
export type Message = { id: string; session_id: string; sender: string; body: string | null; file_path: string | null; file_name: string | null; mime: string | null; size_bytes: number | null; kind: "text" | "file" | "system"; created_at: string };

export function useWallet() {
  const { user } = useAuth();
  return useQuery({ queryKey: ["wallet", user?.id], enabled: !!user, queryFn: async () => {
    const { data, error } = await supabase.rpc("my_wallet"); if (error) throw error; return data as unknown as Wallet;
  } });
}
export const rpcErr = (e: { message?: string } | null) => (e?.message ?? "").replace(/^.*?: /, (m) => (m.length < 20 ? "" : m));
