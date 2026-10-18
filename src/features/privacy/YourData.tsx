import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, FileText, ShieldCheck, Trash2, Undo2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { exportFileName } from "./exportFile";

type Priv = { pending_delete: { due_at: string; created_at: string } | null; blockers: string[]; wallet_balance: number; grace_days: number };

export function usePrivacy() {
  const { user } = useAuth();
  return useQuery({ queryKey: ["my-privacy", user?.id], enabled: !!user, queryFn: async () => {
    const { data, error } = await supabase.rpc("my_privacy"); if (error) throw error; return data as unknown as Priv;
  } });
}

export function YourData() {
  const { t, i18n } = useTranslation(); const q = usePrivacy(); const qc = useQueryClient();
  const [busy, setBusy] = useState(false); const [asking, setAsking] = useState(false); const [confirm, setConfirm] = useState("");
  const word = i18n.language?.startsWith("ta") ? "நீக்கு" : "DELETE";
  const refresh = () => qc.invalidateQueries({ queryKey: ["my-privacy"] });

  const download = async () => {
    setBusy(true); const { data, error } = await supabase.rpc("my_data_export"); setBusy(false);
    if (error) { toast.error(error.message.includes("limit") ? t("privacy.tooMany") : error.message); return; }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = exportFileName(new Date());
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    toast.success(t("privacy.downloaded"));
  };
  const request = async () => {
    setBusy(true); const { error } = await supabase.rpc("account_delete_request", { _confirm: confirm.trim() }); setBusy(false);
    if (error) { toast.error(t("privacy.typeWord", { word })); return; }
    setAsking(false); setConfirm(""); refresh(); toast.success(t("privacy.scheduled"));
  };
  const cancel = async () => {
    setBusy(true); const { error } = await supabase.rpc("account_delete_cancel"); setBusy(false);
    if (error) { toast.error(error.message); return; }
    refresh(); toast.success(t("privacy.cancelled"));
  };

  const p = q.data;
  const due = p?.pending_delete ? new Date(p.pending_delete.due_at).toLocaleString(i18n.language, { dateStyle: "medium", timeStyle: "short" }) : "";
  return (
    <div data-testid="your-data" className="space-y-3">
      <p className="text-xs text-muted-foreground">{t("privacy.intro")}</p>
      <button data-testid="data-export" disabled={busy} onClick={download}
        className="tap flex w-full items-center justify-center gap-2 rounded-xl border px-3 text-sm font-semibold disabled:opacity-50">
        <Download className="h-4 w-4" />{t("privacy.download")}
      </button>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <Link data-testid="link-privacy" to="/privacy" className="inline-flex items-center gap-1 underline"><ShieldCheck className="h-3.5 w-3.5" />{t("legal.privacy")}</Link>
        <Link data-testid="link-terms" to="/terms" className="inline-flex items-center gap-1 underline"><FileText className="h-3.5 w-3.5" />{t("legal.terms")}</Link>
      </div>
      <hr className="border-border" />
      {!p ? <div className="h-12 animate-pulse rounded-xl bg-muted" /> : p.pending_delete ? (
        <div data-testid="delete-pending" className="space-y-2 rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm">
          <p className="font-semibold text-destructive">{t("privacy.pending", { due })}</p>
          {p.blockers.length > 0 && <p data-testid="delete-blockers" className="text-xs">{t("privacy.waiting")}: {p.blockers.map((b) => t(`privacy.b.${b}`)).join(", ")}</p>}
          <button data-testid="delete-cancel" disabled={busy} onClick={cancel} className="tap flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground"><Undo2 className="h-4 w-4" />{t("privacy.cancel")}</button>
        </div>
      ) : !asking ? (
        <button data-testid="delete-start" onClick={() => setAsking(true)} className="tap flex w-full items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold text-destructive hover:bg-destructive/10">
          <Trash2 className="h-4 w-4" />{t("privacy.delete")}
        </button>
      ) : (
        <div data-testid="delete-confirm" className="space-y-2 rounded-xl border border-destructive/40 p-3 text-sm">
          <p>{t("privacy.explain", { days: p.grace_days })}</p>
          <ul className="list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
            <li>{t("privacy.keeps")}</li>
            {Number(p.wallet_balance) > 0 && <li data-testid="delete-wallet" className="font-semibold text-destructive">{t("privacy.wallet", { amount: Number(p.wallet_balance) })}</li>}
            {p.blockers.length > 0 && <li data-testid="delete-blockers">{t("privacy.waiting")}: {p.blockers.map((b) => t(`privacy.b.${b}`)).join(", ")}</li>}
          </ul>
          <label className="block text-xs font-medium" htmlFor="delete-word">{t("privacy.typeWord", { word })}</label>
          <input id="delete-word" data-testid="delete-word" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off"
            className="w-full rounded-xl border bg-card px-3 py-2 text-sm" />
          <div className="flex gap-2">
            <button onClick={() => { setAsking(false); setConfirm(""); }} className="tap flex-1 rounded-xl border px-3 text-sm">{t("privacy.keep")}</button>
            <button data-testid="delete-submit" disabled={busy || confirm.trim().toUpperCase() !== word.toUpperCase()} onClick={request}
              className="tap flex-1 rounded-xl bg-destructive px-3 text-sm font-semibold text-destructive-foreground disabled:opacity-40">{t("privacy.confirm")}</button>
          </div>
        </div>
      )}
    </div>
  );
}
