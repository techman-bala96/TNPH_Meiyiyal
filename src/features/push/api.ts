import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { db } from "./db";
import { useAuth } from "@/hooks/useAuth";
import { currentSubscription, pushSupport, type PushSupport } from "./webPush";

export type Note = { id: string; kind: string; category: string; priority: string; params: Record<string, unknown>; url: string; tag: string | null;
  count: number; push_status: string; created_at: string; updated_at: string; read_at: string | null };

const notesTable = () => db.from("notifications");

export function useNotifications(limit = 50) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["notifications", user?.id, limit], enabled: !!user,
    queryFn: async () => {
      const { data, error } = await notesTable().select("id,kind,category,priority,params,url,tag,count,push_status,created_at,updated_at,read_at")
        .order("created_at", { ascending: false }).limit(limit);
      if (error) throw error;
      return (data ?? []) as unknown as Note[];
    },
  });
}

export function useUnreadCount() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["notifications", user?.id, "unread"], enabled: !!user,
    queryFn: async () => {
      const { count, error } = await notesTable().select("id", { count: "exact", head: true }).is("read_at", null);
      if (error) throw error;
      return count ?? 0;
    },
  });
}

export async function markRead(ids?: string[]) {
  await db.rpc("notifications_mark_read", { _ids: ids ?? null });
}

export function useInvalidateNotes() {
  const qc = useQueryClient();
  return useCallback(() => qc.invalidateQueries({ queryKey: ["notifications"] }), [qc]);
}

/** This device: browser support + whether it is subscribed and known to the server. */
export function usePushState() {
  const { user } = useAuth();
  const [support, setSupport] = useState<PushSupport>(() => pushSupport());
  const q = useQuery({
    queryKey: ["push-device", user?.id], enabled: !!user,
    queryFn: async () => {
      const sub = await currentSubscription().catch(() => null);
      if (!sub) return { enabled: false, endpoint: null as string | null };
      const { data } = await db.from("push_subscriptions")
        .select("id").eq("endpoint", sub.endpoint).maybeSingle();
      return { enabled: !!data, endpoint: sub.endpoint };
    },
  });
  const qc = useQueryClient();
  const refresh = useCallback(() => { setSupport(pushSupport()); return qc.invalidateQueries({ queryKey: ["push-device"] }); }, [qc]);
  useEffect(() => {
    const f = () => { if (document.visibilityState === "visible") setSupport(pushSupport()); };
    document.addEventListener("visibilitychange", f); return () => document.removeEventListener("visibilitychange", f);
  }, []);
  return { support, enabled: !!q.data?.enabled, loading: q.isLoading, refresh };
}
