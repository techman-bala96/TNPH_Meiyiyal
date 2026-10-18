import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, Flag, Loader2, Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { tr } from "@/features/rewards/types";
import { useFeedbackConfig } from "./api";

type Fb = { rating: number; tags: string[]; comment: string | null; is_complaint: boolean };

export function FeedbackCard({ sessionId, workerName }: { sessionId: string; workerName: string }) {
  const { t, i18n } = useTranslation(); const lang = i18n.language ?? "en"; const qc = useQueryClient();
  const cfg = useFeedbackConfig();
  const mine = useQuery({ queryKey: ["my-feedback", sessionId], queryFn: async () => { const { data, error } = await supabase.rpc("my_feedback", { _sid: sessionId }); if (error) throw error; return data as unknown as Fb | null; } });
  const [rating, setRating] = useState(0); const [hover, setHover] = useState(0); const [tags, setTags] = useState<string[]>([]); const [comment, setComment] = useState("");
  const [complaint, setComplaint] = useState(false); const [reason, setReason] = useState<string>(""); const [busy, setBusy] = useState(false);
  if (mine.isLoading || cfg.isLoading) return <div className="h-40 animate-pulse rounded-2xl bg-muted" />;
  if (mine.data) return (
    <div data-testid="feedback-done" className="flex flex-col items-center gap-1 rounded-2xl bg-emerald-500/10 p-4 text-center animate-in zoom-in-95">
      <CheckCircle2 className="h-8 w-8 text-emerald-700" /><p className="font-semibold">{t("feedback.thanks")}</p>
      <p className="flex gap-0.5">{[1, 2, 3, 4, 5].map((i) => <Star key={i} className={`h-4 w-4 ${i <= mine.data!.rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"}`} />)}</p>
      {mine.data.is_complaint && <p className="text-xs text-muted-foreground">{t("feedback.complaintLogged")}</p>}
    </div>);
  const c = cfg.data!; const good = rating >= c.good_rating_min; const list = rating === 0 ? [] : good ? c.tags.positive : c.tags.negative;
  const submit = async () => {
    setBusy(true);
    const { data, error } = await supabase.rpc("feedback_submit", { _sid: sessionId, _rating: rating, _tags: tags, _comment: comment || null, _complaint: complaint, _complaint_reason: complaint ? reason : null });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(t("feedback.thanks"));
    const awarded = (data as { awarded?: string[] })?.awarded ?? [];
    if (awarded.length) toast(t("feedback.workerAwarded", { name: workerName }));
    qc.invalidateQueries({ queryKey: ["my-feedback", sessionId] }); qc.invalidateQueries({ queryKey: ["history"] });
  };
  return (
    <div data-testid="feedback-card" className="space-y-3 rounded-2xl border bg-background p-4 text-left animate-in slide-in-from-bottom-2">
      <p className="text-center font-semibold">{t("feedback.title", { name: workerName })}</p>
      <div className="flex justify-center gap-1" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((i) => (
          <button key={i} data-testid={`star-${i}`} aria-label={`${i}`} onMouseEnter={() => setHover(i)} onClick={() => { setRating(i); setTags([]); }} className="p-1 transition active:scale-75">
            <Star className={`h-9 w-9 transition ${i <= (hover || rating) ? "scale-110 fill-amber-400 text-amber-400" : "text-muted-foreground/40"}`} />
          </button>))}
      </div>
      {rating > 0 && <p className="text-center text-xs text-muted-foreground">{t(`feedback.r${rating}`)}</p>}
      {list.length > 0 && (
        <div className="flex flex-wrap justify-center gap-1.5">
          {list.map((g) => { const on = tags.includes(g.key); return (
            <button key={g.key} data-testid={`tag-${g.key}`} onClick={() => setTags(on ? tags.filter((x) => x !== g.key) : [...tags, g.key])}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition ${on ? (good ? "border-emerald-500 bg-emerald-500 text-white" : "border-rose-500 bg-rose-500 text-white") : "bg-card hover:bg-muted"}`}>{tr(g, lang)}</button>); })}
        </div>)}
      {rating > 0 && <textarea data-testid="feedback-comment" maxLength={500} value={comment} onChange={(e) => setComment(e.target.value)} placeholder={t("feedback.comment")} rows={2}
        className="w-full resize-none rounded-xl border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40" />}
      <button data-testid="report-toggle" onClick={() => setComplaint(!complaint)} className={`flex items-center gap-1.5 text-xs font-semibold ${complaint ? "text-rose-600" : "text-muted-foreground"}`}><Flag className="h-3.5 w-3.5" />{t("feedback.report")}</button>
      {complaint && (
        <div className="space-y-1.5 rounded-xl bg-rose-500/10 p-3 animate-in fade-in">
          <p className="text-xs text-rose-700 dark:text-rose-300">{t("feedback.reportHint")}</p>
          <div className="flex flex-wrap gap-1.5">{c.tags.complaint.map((g) => (
            <button key={g.key} data-testid={`reason-${g.key}`} onClick={() => setReason(g.key)} className={`rounded-full border px-3 py-1 text-xs ${reason === g.key ? "border-rose-600 bg-rose-600 text-white" : "bg-card"}`}>{tr(g, lang)}</button>))}</div>
        </div>)}
      <button data-testid="feedback-submit" disabled={!rating || busy || (complaint && !reason)} onClick={submit}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground transition active:scale-[.98] disabled:opacity-40">
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}{complaint ? t("feedback.submitReport") : t("feedback.submit")}</button>
    </div>
  );
}
