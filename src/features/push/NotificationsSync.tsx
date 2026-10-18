import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { markRead, useUnreadCount } from "./api";
import { syncPush } from "./webPush";
import { toast } from "sonner";
import { renderText } from "./text";

/** App-wide glue: live inbox updates, taps coming from the service worker, device language, app-icon badge. */
export function NotificationsSync() {
  const { user } = useAuth(); const uid = user?.id; const qc = useQueryClient(); const nav = useNavigate(); const loc = useLocation();
  const { i18n } = useTranslation(); const lang = i18n.language?.startsWith("ta") ? "ta" : "en";
  const langRef = useRef<"en" | "ta">(lang); langRef.current = lang;
  const unread = useUnreadCount();

  // new / updated rows for me → refresh the bell and the list
  useEffect(() => {
    if (!uid) return;
    const ch = supabase.channel(`notes:${uid}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${uid}` }, (p) => {
        qc.invalidateQueries({ queryKey: ["notifications"] });
        // the server switched this worker Offline (missed rings): update the switch everywhere and say why
        const n = p.new as { kind?: string; params?: Record<string, unknown> } | null;
        if (p.eventType === "INSERT" && n?.kind === "worker.auto_offline") {
          qc.invalidateQueries({ queryKey: ["my-worker"] });
          const r = renderText({ kind: n.kind, params: n.params }, langRef.current); toast.warning(r.title, { id: "auto-offline", description: r.body, duration: 10_000 });
        }
      })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [uid, qc]);

  // messages from the service worker
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const onMsg = (e: MessageEvent) => {
      const d = e.data as { type?: string; url?: string } | null;
      if (d?.type === "meiyiyal:navigate" && d.url?.startsWith("/")) nav(d.url);
      else if (d?.type === "meiyiyal:push") qc.invalidateQueries({ queryKey: ["notifications"] });
      else if (d?.type === "meiyiyal:resubscribe") void syncPush(lang);
    };
    navigator.serviceWorker.addEventListener("message", onMsg);
    return () => navigator.serviceWorker.removeEventListener("message", onMsg);
  }, [nav, qc, lang]);

  // keep this device's server row (owner + language) current
  useEffect(() => { if (uid) void syncPush(lang).then((on) => { if (on) qc.invalidateQueries({ queryKey: ["push-device"] }); }); }, [uid, lang, qc]);

  // opened from a notification: ?nid=<id> marks it read, then the param is dropped
  useEffect(() => {
    const sp = new URLSearchParams(loc.search); const nid = sp.get("nid");
    if (!uid || !nid) return;
    void markRead([nid]).then(() => qc.invalidateQueries({ queryKey: ["notifications"] }));
    sp.delete("nid"); nav({ pathname: loc.pathname, search: sp.toString() ? `?${sp}` : "" }, { replace: true });
  }, [uid, loc.search, loc.pathname, nav, qc]);

  // number on the app icon (where the browser supports it)
  useEffect(() => {
    const n = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
    if (!n.setAppBadge) return;
    const c = unread.data ?? 0;
    void (c > 0 ? n.setAppBadge(c) : n.clearAppBadge?.())?.catch(() => undefined);
  }, [unread.data]);
  return null;
}
