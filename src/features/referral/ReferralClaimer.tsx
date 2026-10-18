import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { clearReferral, pendingReferral } from "./capture";

// Claims a remembered invite code once the visitor has signed in. Terminal answers clear it; network errors keep it for next time.
export function ReferralClaimer() {
  const { user } = useAuth(); const { t } = useTranslation(); const qc = useQueryClient(); const tried = useRef<string | null>(null);
  useEffect(() => {
    const p = pendingReferral();
    if (!user || !p || tried.current === user.id) return;
    tried.current = user.id;
    void supabase.rpc("referral_claim", { _code: p.code, _landing: p.landing }).then(({ data, error }) => {
      if (error) return;
      clearReferral();
      if (data === "ok") { toast.success(t("invite.applied", { code: p.code })); qc.invalidateQueries({ queryKey: ["my-referral"] }); }
    });
  }, [user, t, qc]);
  return null;
}
