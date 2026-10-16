import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Clock, Coins, History as HistoryIcon, MessageSquareText } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { PageShell } from "@/components/app/PageShell";
import { supabase } from "@/integrations/supabase/client";
import { initials } from "@/features/profile/useProfile";
import { ModeIcon } from "@/features/consult/ConsultProvider";
import { WalletChip } from "@/features/consult/RequestSheet";
import type { Mode } from "@/features/consult/api";

type Row = { id: string; role: "user" | "worker"; other_name: string; other_photo: string | null; node_name: { en: string; ta?: string } | null; category_name: { en: string; ta?: string } | null;
  modes: Mode[]; started_at: string; duration_sec: number; credits: number; earned: number; status: string; end_reason: string | null; messages: number };
const dur = (s: number) => (s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`);

export default function History() {
  const { t, i18n } = useTranslation(); const ta = i18n.language?.startsWith("ta");
  const q = useQuery({ queryKey: ["history"], queryFn: async () => { const { data, error } = await supabase.rpc("my_history"); if (error) throw error; return data as unknown as Row[]; } });
  const n = (x: { en: string; ta?: string } | null) => (x ? (ta && x.ta) || x.en : "");
  return (
    <PageShell title={t("consult.history")} testId="history-page">
      <WalletChip />
      {q.isLoading && [0, 1, 2].map((i) => <div key={i} className="h-20 animate-pulse rounded-2xl bg-muted" />)}
      {q.data?.length === 0 && <div data-testid="history-empty" className="card-soft flex flex-col items-center gap-2 p-8 text-center"><HistoryIcon className="h-10 w-10 text-muted-foreground" /><p className="font-semibold">{t("consult.noHistory")}</p></div>}
      <ul className="space-y-2">
        {q.data?.map((r, i) => (
          <li key={r.id} style={{ animationDelay: `${i * 40}ms` }} className="animate-in fade-in slide-in-from-bottom-2 fill-mode-both">
            <Link to={`/session/${r.id}`} data-testid="history-row" data-role={r.role} data-name={r.other_name} className="card-soft flex items-center gap-3 p-3 transition hover:-translate-y-0.5">
              <Avatar className="h-12 w-12 rounded-2xl">{r.other_photo && <AvatarImage src={r.other_photo} className="object-cover" />}<AvatarFallback className="rounded-2xl bg-primary/10 text-primary">{initials(r.other_name)}</AvatarFallback></Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2"><p className="truncate font-semibold">{r.other_name}</p>
                  {r.status === "active" && <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-600">{t("consult.live")}</span>}</div>
                <p className="truncate text-xs text-muted-foreground" data-testid="history-prof">{[n(r.category_name), n(r.node_name)].filter(Boolean).join(" · ")}</p>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1" data-testid="history-modes">{r.modes.map((m) => <ModeIcon key={m} mode={m} className="h-3.5 w-3.5" />)}</span>
                  <span className="flex items-center gap-0.5"><Clock className="h-3.5 w-3.5" /><span data-testid="history-duration">{dur(r.duration_sec)}</span></span>
                  <span className="flex items-center gap-0.5 font-semibold text-foreground"><Coins className="h-3.5 w-3.5 text-amber-500" /><span data-testid="history-credits">{r.role === "user" ? `-${Number(r.credits)}` : `+${Number(r.earned)}`}</span></span>
                  <span className="flex items-center gap-0.5"><MessageSquareText className="h-3.5 w-3.5" />{r.messages}</span>
                  <span>{new Date(r.started_at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</span>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </Link>
          </li>))}
      </ul>
    </PageShell>
  );
}
