import { useState } from "react";
import { friendlyError } from "@/lib/friendlyError";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, Gift, Share2, UserPlus } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { inviteLinks, normalizeCode } from "./capture";

type Mine = { code: string; joined: number; joined_workers: number; referred_by: string | null; can_claim: boolean };

export function useMyReferral() {
  const { user } = useAuth();
  return useQuery({ queryKey: ["my-referral", user?.id], enabled: !!user, staleTime: 60_000, queryFn: async () => {
    const { data, error } = await supabase.rpc("my_referral"); if (error) throw error; return data as unknown as Mine;
  } });
}

export function InviteCard() {
  const { t } = useTranslation(); const q = useMyReferral(); const qc = useQueryClient();
  const [enter, setEnter] = useState(""); const [busy, setBusy] = useState(false);
  if (!q.data) return <div className="h-28 animate-pulse rounded-2xl bg-muted" />;
  const links = inviteLinks(q.data.code);
  const copy = async (s: string) => { try { await navigator.clipboard.writeText(s); toast.success(t("invite.copied")); } catch { toast.error(s); } };
  const share = async (url: string) => {
    const data = { title: "Meiyiyal", text: t("invite.shareText", { code: q.data!.code }), url };
    if (navigator.share) { try { await navigator.share(data); } catch { /* cancelled */ } } else copy(url);
  };
  const claim = async () => {
    const code = normalizeCode(enter); if (!code) { toast.error(t("invite.r.invalid")); return; }
    setBusy(true); const { data, error } = await supabase.rpc("referral_claim", { _code: code, _landing: "user" }); setBusy(false);
    if (error) { toast.error(friendlyError(t, error.message)); return; }
    if (data === "ok") { toast.success(t("invite.applied", { code })); setEnter(""); qc.invalidateQueries({ queryKey: ["my-referral"] }); }
    else toast.error(t(`invite.r.${data}`, { defaultValue: t("invite.r.invalid") }));
  };
  return (
    <section data-testid="invite-card" className="card-soft space-y-3 p-4">
      <div className="flex items-center gap-2"><Gift className="h-5 w-5 text-primary" /><h2 className="font-semibold">{t("invite.title")}</h2></div>
      <p className="text-xs text-muted-foreground">{t("invite.body")}</p>
      <div className="flex items-center gap-2">
        <code data-testid="invite-code" className="flex-1 rounded-xl bg-primary/10 px-3 py-2 text-center text-lg font-bold tracking-[0.2em] text-primary">{q.data.code}</code>
        <button data-testid="invite-copy-code" onClick={() => copy(q.data!.code)} aria-label={t("invite.copyCode")} className="tap grid w-11 place-items-center rounded-xl border"><Copy className="h-4 w-4" /></button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <button data-testid="invite-share-user" onClick={() => share(links.user)} className="tap flex items-center justify-center gap-2 rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground"><Share2 className="h-4 w-4" />{t("invite.shareUser")}</button>
        <button data-testid="invite-share-worker" onClick={() => share(links.worker)} className="tap flex items-center justify-center gap-2 rounded-xl border px-3 text-sm font-semibold"><UserPlus className="h-4 w-4" />{t("invite.shareWorker")}</button>
      </div>
      <div className="flex items-center gap-2 rounded-xl bg-muted/60 py-1 pl-3 pr-1">
        <span className="shrink-0 text-[11px] font-semibold text-muted-foreground">{t("invite.link")}</span>
        <span data-testid="invite-link" title={links.user} className="min-w-0 flex-1 truncate text-xs">{links.user.replace(/^https?:\/\//, "")}</span>
        <button data-testid="invite-copy-link" onClick={() => copy(links.user)} aria-label={t("invite.copyLink")} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg hover:bg-background"><Copy className="h-3.5 w-3.5" /></button>
      </div>
      <p data-testid="invite-joined" data-n={q.data.joined} className="text-xs">{t("invite.joined", { count: Number(q.data.joined), workers: Number(q.data.joined_workers) })}</p>
      <p className="text-[11px] text-muted-foreground">{t("invite.noRewards")}</p>
      {q.data.referred_by ? <p data-testid="invite-referred-by" className="text-xs text-muted-foreground">{t("invite.referredBy", { code: q.data.referred_by })}</p>
        : q.data.can_claim && (
          <div className="flex gap-2">
            <input data-testid="invite-enter" aria-label={t("invite.enter")} value={enter} onChange={(e) => setEnter(e.target.value.toUpperCase())} placeholder={t("invite.enter")} className="min-w-0 flex-1 rounded-xl border bg-card px-3 py-2 text-sm uppercase" />
            <button data-testid="invite-apply" disabled={busy || !enter} onClick={claim} className="rounded-xl border px-3 text-sm font-semibold disabled:opacity-40">{t("invite.apply")}</button>
          </div>)}
    </section>
  );
}
