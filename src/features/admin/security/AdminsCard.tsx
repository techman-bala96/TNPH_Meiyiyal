import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ShieldCheck, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

type A = { user_id: string; name: string | null; email: string | null; factors: number; last_verified: string | null };

/** Who holds admin, whether each has an authenticator, and an audited reset for a colleague's lost phone. */
export function AdminsCard() {
  const { t } = useTranslation(); const { user } = useAuth(); const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin-admins"], queryFn: async () => { const { data, error } = await supabase.rpc("admin_list_admins"); if (error) throw error; return data as A[]; } });
  const [resetting, setResetting] = useState<string | null>(null); const [note, setNote] = useState("");
  const reset = async (id: string) => {
    const { error } = await supabase.rpc("admin_reset_mfa", { _user: id, _note: note });
    if (error) { toast.error(error.message); return; }
    toast.success(t("mfa.resetDone")); setResetting(null); setNote(""); qc.invalidateQueries({ queryKey: ["admin-admins"] });
  };
  return (
    <section data-testid="admins-card" className="card-soft space-y-3 p-4">
      <h2 className="font-semibold">{t("mfa.admins")}</h2>
      <ul className="divide-y text-sm">
        {q.data?.map((a) => (
          <li key={a.user_id} data-testid="admin-row" className="space-y-2 py-2">
            <div className="flex items-center gap-2">
              {a.factors > 0 ? <ShieldCheck className="h-4 w-4 shrink-0 text-primary" aria-hidden /> : <ShieldAlert className="h-4 w-4 shrink-0 text-amber-600" aria-hidden />}
              <div className="min-w-0 flex-1"><p className="truncate font-medium">{a.name || a.email}</p>
                <p className="truncate text-xs text-muted-foreground">{a.factors > 0 ? t("mfa.hasFactor") : t("mfa.noFactor")}{a.last_verified ? ` · ${new Date(a.last_verified).toLocaleString()}` : ""}</p></div>
              {a.user_id !== user?.id && a.factors > 0 && <button onClick={() => setResetting(resetting === a.user_id ? null : a.user_id)} className="rounded-lg border px-2 py-1 text-xs">{t("mfa.reset")}</button>}
            </div>
            {resetting === a.user_id && (
              <div className="flex gap-2">
                <input aria-label={t("mfa.resetNote")} placeholder={t("mfa.resetNote")} value={note} onChange={(e) => setNote(e.target.value)} className="min-w-0 flex-1 rounded-xl border bg-card px-3 py-1.5 text-xs" />
                <button disabled={note.trim().length < 5} onClick={() => reset(a.user_id)} className="rounded-xl bg-destructive px-3 text-xs font-semibold text-destructive-foreground disabled:opacity-40">{t("mfa.resetConfirm")}</button>
              </div>)}
          </li>))}
      </ul>
    </section>
  );
}
