import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { idleMs } from "./totp";

/** Signs an admin out after `minutes` without input. Any tab's activity counts (shared through localStorage). */
export function useIdleSignOut(minutes: number | undefined, onSignOut: () => void) {
  useEffect(() => {
    const limit = idleMs(minutes); const KEY = "meiyiyal-admin-active";
    const touch = () => { try { localStorage.setItem(KEY, String(Date.now())); } catch { /* private mode */ } };
    touch();
    const evs = ["pointerdown", "keydown", "scroll", "visibilitychange"] as const;
    evs.forEach((e) => window.addEventListener(e, touch, { passive: true }));
    const timer = window.setInterval(async () => {
      const last = Number(localStorage.getItem(KEY) || Date.now());
      if (Date.now() - last > limit) {
        window.clearInterval(timer);
        await supabase.rpc("admin_security_event", { _event: "idle.signout" }).then(() => undefined, () => undefined);
        await supabase.auth.signOut(); onSignOut();
      }
    }, 30_000);
    return () => { window.clearInterval(timer); evs.forEach((e) => window.removeEventListener(e, touch)); };
  }, [minutes, onSignOut]);
}
