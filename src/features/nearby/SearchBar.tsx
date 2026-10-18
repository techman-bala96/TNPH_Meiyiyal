import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowUpRight, Clock, Loader2, Mic, Search, Sparkles, X } from "lucide-react";
import { nodeName, pathTo, useTaxonomy } from "@/features/taxonomy/useTaxonomy";
import { iconFor } from "@/features/taxonomy/icons";
import { askAgent, browseUrl, type AgentResult } from "@/features/voice/agent";
import { useVoice } from "@/features/voice/context";
import { suggest } from "./match";

const RECENT_KEY = "meiyiyal.searches";
const readRecent = (): string[] => { try { return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]").slice(0, 6); } catch { return []; } };
const pushRecent = (q: string) => { try { localStorage.setItem(RECENT_KEY, JSON.stringify([q, ...readRecent().filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(0, 6))); } catch { /* private mode */ } };

type AgentPlus = AgentResult & { alternatives?: { value: string; label: { en: string; ta: string } }[] };

/** One box for typing and speaking. Typing shows instant matches; Enter asks the same assistant the mic uses. */
export function SearchBar({ compact = false }: { compact?: boolean }) {
  const { t, i18n } = useTranslation(); const lang: "en" | "ta" = i18n.language?.startsWith("ta") ? "ta" : "en";
  const nav = useNavigate(); const loc = useLocation(); const tax = useTaxonomy(); const voice = useVoice();
  const [q, setQ] = useState(""); const [open, setOpen] = useState(false); const [busy, setBusy] = useState(false);
  const [question, setQuestion] = useState<AgentPlus["question"]>(null); const [note, setNote] = useState<string | null>(null);
  const pending = useRef<Record<string, unknown> | null>(null); const box = useRef<HTMLDivElement>(null); const input = useRef<HTMLInputElement>(null);
  const [recent, setRecent] = useState<string[]>(readRecent);
  const nodes = useMemo(() => tax.data ?? [], [tax.data]);
  const hits = useMemo(() => suggest(q, nodes.map((n) => ({ slug: n.slug, parent: n.parent, kind: n.kind, name: n.name as { en: string; ta?: string }, synonyms: n.synonyms }))), [q, nodes]);
  const examples = t("nearby.search.examples", { returnObjects: true }) as string[];

  useEffect(() => { // close on outside tap
    const f = (e: PointerEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", f); return () => document.removeEventListener("pointerdown", f);
  }, []);
  useEffect(() => { setOpen(false); setQuestion(null); pending.current = null; }, [loc.pathname]);

  const go = (slug: string, extra = "") => { setOpen(false); setQuestion(null); pending.current = null; input.current?.blur(); nav(`/browse/${slug}${extra}`); };
  const submit = async (text: string, keepPending = false) => {
    const s = text.trim(); if (!s || busy) return;
    if (!keepPending) pending.current = null;
    pushRecent(s); setRecent(readRecent()); setBusy(true); setNote(null);
    try {
      const m = loc.pathname.match(/^\/browse\/([^/?]+)/);
      const r = (await askAgent(s, /[\u0B80-\u0BFF]/.test(s) ? "ta" : lang, pending.current, { current_node: m?.[1] ?? null, route: loc.pathname, source: "search" })) as AgentPlus;
      if ((r.action === "navigate" || r.action === "refine") && r.node) {
        const url = browseUrl(r.node, r.filters); const alt = (r.alternatives ?? []).map((a) => a.value).join(",");
        setOpen(false); setQuestion(null); pending.current = null; input.current?.blur();
        nav(alt ? `${url}&alt=${encodeURIComponent(alt)}` : url);
      } else if (r.action === "ask" && r.question) { setQuestion(r.question); pending.current = r.pending; setOpen(true); }
      else { setQuestion(null); setNote(r.reply?.[lang] ?? t("nearby.search.nothing")); setOpen(true); }
    } catch {
      // assistant unreachable: fall back to the best local match so search still works
      if (hits[0]) { setNote(null); go(hits[0].slug, "?list=1"); } else { setNote(t("nearby.search.offline")); setOpen(true); }
    } finally { setBusy(false); }
  };

  const crumbs = (slug: string) => pathTo(nodes, slug).slice(1, -1).map((p) => nodeName(p, lang)).join(" › ");
  const showPanel = open && (q.length > 0 || recent.length > 0 || !!question || !!note || examples.length > 0);

  return (
    <div ref={box} className="relative z-30" data-testid="search-bar">
      <form role="search" onSubmit={(e) => { e.preventDefault(); void submit(q); }}
        className={`group flex items-center gap-2 rounded-2xl border bg-card/90 px-3 shadow-sm ring-primary/30 backdrop-blur transition focus-within:shadow-lg focus-within:ring-4 ${compact ? "h-11" : "h-14"}`}>
        {busy ? <Loader2 className="h-5 w-5 shrink-0 animate-spin text-primary" /> : <Search className="h-5 w-5 shrink-0 text-muted-foreground" />}
        <input ref={input} data-testid="search-input" value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); setNote(null); if (!e.target.value) { setQuestion(null); pending.current = null; } }}
          onFocus={() => setOpen(true)} onKeyDown={(e) => { if (e.key === "Escape") { setOpen(false); input.current?.blur(); } }}
          placeholder={t("nearby.search.placeholder")} aria-label={t("nearby.search.placeholder")} enterKeyHint="search" autoComplete="off"
          className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground/80" />
        {q && <button type="button" data-testid="search-clear" aria-label={t("nearby.search.clear")} onClick={() => { setQ(""); setQuestion(null); setNote(null); input.current?.focus(); }}
          className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button>}
        {voice.enabled && <button type="button" data-testid="search-mic" onClick={voice.toggle} aria-label={t("nearby.search.mic")} aria-pressed={voice.state !== "off"}
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl transition active:scale-90 ${voice.state !== "off" ? "bg-rose-500 text-white shadow-lg shadow-rose-500/30" : "bg-primary/10 text-primary hover:bg-primary/15"}`}>
          <Mic className="h-[18px] w-[18px]" /></button>}
      </form>

      {showPanel && (
        <div data-testid="search-panel" className="absolute inset-x-0 top-full z-50 mt-2 max-h-[60dvh] overflow-y-auto rounded-2xl border bg-popover p-2 text-popover-foreground shadow-2xl animate-in fade-in slide-in-from-top-1">
          {question && (
            <div data-testid="search-question" className="space-y-2 p-2">
              <p className="flex items-center gap-1.5 text-sm font-semibold"><Sparkles className="h-4 w-4 text-primary" />{question.text[lang]}</p>
              <div className="flex flex-wrap gap-1.5">{question.options.map((o) => (
                <button key={o.value} type="button" data-testid="search-option" data-value={o.value} onClick={() => void submit(o.label[lang] || o.label.en, true)}
                  className="rounded-full bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary transition hover:bg-primary/20 active:scale-95">{o.label[lang] || o.label.en}</button>))}</div>
            </div>)}
          {note && <p data-testid="search-note" className="p-3 text-sm text-muted-foreground">{note}</p>}
          {q.length > 0 && hits.map((h) => { const n = nodes.find((x) => x.slug === h.slug)!; const Icon = iconFor(n.icon ?? pathTo(nodes, h.slug).find((p) => p.icon)?.icon);
            return (
              <button key={h.slug} type="button" data-testid="search-suggestion" data-slug={h.slug} onClick={() => { pushRecent(q.trim()); go(h.slug, n.kind === "category" ? "" : "?list=1"); }}
                className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition hover:bg-muted">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Icon className="h-[18px] w-[18px]" /></span>
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{nodeName(n, lang)}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">{[crumbs(h.slug), h.via ? t("nearby.search.via", { w: h.via }) : ""].filter(Boolean).join(" · ")}</span></span>
                <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
              </button>); })}
          {q.trim().length > 0 && (
            <button type="button" data-testid="search-submit" onClick={() => void submit(q)} className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left text-sm font-semibold text-primary hover:bg-muted">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-primary-foreground"><Search className="h-4 w-4" /></span>{t("nearby.search.askFor", { q: q.trim() })}</button>)}
          {!q && !question && (
            <div className="space-y-3 p-2">
              {recent.length > 0 && <div><p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t("nearby.search.recent")}</p>
                <div className="flex flex-wrap gap-1.5">{recent.map((r) => <button key={r} type="button" data-testid="search-recent" onClick={() => { setQ(r); void submit(r); }}
                  className="flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs hover:bg-muted"><Clock className="h-3 w-3" />{r}</button>)}</div></div>}
              <div><p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t("nearby.search.popular")}</p>
                <div className="flex flex-wrap gap-1.5">{examples.map((r) => <button key={r} type="button" data-testid="search-example" onClick={() => { setQ(r); void submit(r); }}
                  className="rounded-full bg-muted px-3 py-1.5 text-xs font-medium transition hover:bg-muted/70">{r}</button>)}</div></div>
            </div>)}
        </div>)}
    </div>
  );
}
