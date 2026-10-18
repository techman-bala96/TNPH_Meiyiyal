import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";

type Appeal = { appeal_id: string; case_id: string; worker_id: string; display_name: string; primary_node: string; note: string; status: string;
  sla_due_at: string; created_at: string; decided_at: string | null; rejected_by_me: boolean; rejection_note: string | null;
  reason_codes: string[] | null; checks: { check: string; status: string; reason?: string | null }[] };

/** Appeals: one per rejection, 72 h SLA, decided by a different admin than the one who rejected. */
export function Appeals() {
  const { t } = useTranslation(); const qc = useQueryClient();
  const [status, setStatus] = useState("open");
  const q = useQuery({ queryKey: ["admin-appeals", status], queryFn: async () => {
    const { data, error } = await supabase.rpc("admin_appeals", { _status: status }); if (error) throw error; return (data ?? []) as unknown as Appeal[];
  } });
  return (
    <section className="space-y-3" data-testid="admin-appeals">
      <div className="flex gap-1 rounded-2xl bg-muted p-1">
        {["open", "upheld", "overturned", "all"].map((s) => (
          <button key={s} data-testid={`appeals-filter-${s}`} onClick={() => setStatus(s)} className={`tap flex-1 rounded-xl px-3 text-xs font-semibold ${status === s ? "bg-card shadow" : "text-muted-foreground"}`}>{t(`admin.appeals.f.${s}`)}</button>
        ))}
      </div>
      {q.isLoading && <div className="h-24 animate-pulse rounded-2xl bg-muted" />}
      {q.error && <p className="text-sm text-destructive">{(q.error as Error).message}</p>}
      {q.data?.length === 0 && <p data-testid="appeals-empty" className="py-8 text-center text-sm text-muted-foreground">{t("admin.appeals.empty")}</p>}
      <ul className="space-y-3">{q.data?.map((a) => <AppealCard key={a.appeal_id} a={a} onDone={() => { qc.invalidateQueries({ queryKey: ["admin-appeals"] }); qc.invalidateQueries({ queryKey: ["admin-queue"] }); }} />)}</ul>
    </section>
  );
}

function AppealCard({ a, onDone }: { a: Appeal; onDone: () => void }) {
  const { t } = useTranslation(); const [note, setNote] = useState(""); const [busy, setBusy] = useState<string | null>(null); const [err, setErr] = useState<string | null>(null);
  const overdue = a.status === "open" && new Date(a.sla_due_at).getTime() < Date.now();
  async function decide(d: "overturn" | "uphold") {
    setBusy(d); setErr(null);
    const { error } = await supabase.rpc("admin_decide_appeal", { _case: a.case_id, _decision: d, _note: note });
    setBusy(null); if (error) setErr(error.message); else onDone();
  }
  return (
    <li data-testid="appeal-card" data-name={a.display_name} className="card-soft space-y-2 p-4">
      <div className="flex items-start justify-between gap-2">
        <div><p className="font-semibold">{a.display_name}</p><p className="text-xs text-muted-foreground">{a.primary_node.split("--").slice(1).join(" › ")}</p></div>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${overdue ? "bg-destructive/15 text-destructive" : "bg-primary/10 text-primary"}`}>
          {a.status === "open" ? `${t("admin.sla")} ${new Date(a.sla_due_at).toLocaleString()}` : t(`admin.appeals.f.${a.status}`)}</span>
      </div>
      <p className="text-xs"><span className="text-muted-foreground">{t("admin.appeals.rejection")}:</span> {a.rejection_note || "—"}</p>
      <blockquote data-testid="appeal-text" className="rounded-xl bg-muted p-3 text-sm">{a.note}</blockquote>
      {a.checks.length > 0 && <ul className="flex flex-wrap gap-1">{a.checks.map((c) => <li key={c.check} className="rounded-full border px-2 py-0.5 text-[11px]">{c.check}: {c.status}{c.reason ? ` (${c.reason})` : ""}</li>)}</ul>}
      <CaseMedia caseId={a.case_id} />
      {a.status === "open" && (a.rejected_by_me
        ? <p data-testid="appeal-other-admin" className="text-xs text-muted-foreground">{t("admin.appeals.otherAdmin")}</p>
        : <>
          <Textarea data-testid="appeal-decision-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("admin.note")} rows={2} className="rounded-xl text-sm" />
          {err && <p className="text-xs text-destructive">{err}</p>}
          <div className="grid grid-cols-2 gap-2">
            <Button data-testid="appeal-overturn" size="sm" className="rounded-xl" disabled={!!busy || !note.trim()} onClick={() => decide("overturn")}>{busy === "overturn" && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}{t("admin.appeals.overturn")}</Button>
            <Button data-testid="appeal-uphold" size="sm" variant="destructive" className="rounded-xl" disabled={!!busy || !note.trim()} onClick={() => decide("uphold")}>{busy === "uphold" && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}{t("admin.appeals.uphold")}</Button>
          </div>
        </>)}
    </li>
  );
}

type Media = { raw_selfie_path: string | null; frames: { step: string; path: string }[]; steps: string[] | null; window_ok: boolean | null; purged: boolean };

/** Private selfie + liveness frames via 2-minute signed URLs. Every open is written to the admin audit log. */
export function CaseMedia({ caseId }: { caseId: string }) {
  const { t } = useTranslation();
  const [urls, setUrls] = useState<{ label: string; url: string }[] | null>(null); const [info, setInfo] = useState<Media | null>(null);
  const [busy, setBusy] = useState(false);
  async function load() {
    setBusy(true);
    const { data } = await supabase.rpc("admin_case_media", { _case: caseId });
    const m = data as unknown as Media | null; setInfo(m);
    const items = [...(m?.raw_selfie_path ? [{ label: "selfie", path: m.raw_selfie_path }] : []), ...(m?.frames ?? []).map((f) => ({ label: f.step, path: f.path }))];
    const signed = await Promise.all(items.map(async (i) => ({ label: i.label, url: (await supabase.storage.from("kyc").createSignedUrl(i.path, 120)).data?.signedUrl ?? "" })));
    setUrls(signed.filter((s) => s.url)); setBusy(false);
  }
  if (!urls) return <button data-testid="case-media-open" onClick={load} disabled={busy} className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs">{busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Eye className="h-3 w-3" />}{t("admin.media.open")}</button>;
  return (
    <div data-testid="case-media" className="space-y-1">
      <p className="text-[11px] text-muted-foreground">{info?.purged ? t("admin.media.purged") : `${t("admin.media.steps")}: ${(info?.steps ?? []).join(", ") || "—"} · ${info?.window_ok ? t("admin.media.inWindow") : t("admin.media.noWindow")}`}</p>
      <div className="grid grid-cols-4 gap-1 sm:grid-cols-6">{urls.map((u, i) => <figure key={i} className="space-y-0.5"><img src={u.url} alt={u.label} className="aspect-square w-full rounded-lg object-cover" /><figcaption className="truncate text-[10px] text-muted-foreground">{u.label}</figcaption></figure>)}</div>
    </div>
  );
}
