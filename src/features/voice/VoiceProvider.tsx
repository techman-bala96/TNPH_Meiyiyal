import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { askAgent, browseUrl, type AgentResult } from "./agent";
import { createRecognizer, speak, stopSpeaking, type Recognizer } from "./speech";
import { VoiceCtx, type VoiceState } from "./context";
import { VoicePill } from "./VoicePill";

export function VoiceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth(); const nav = useNavigate(); const loc = useLocation(); const { i18n } = useTranslation();
  const lang: "en" | "ta" = i18n.language?.startsWith("ta") ? "ta" : "en";
  const [state, setState] = useState<VoiceState>("off");
  const [interim, setInterim] = useState(""); const [heard, setHeard] = useState("");
  const [result, setResult] = useState<AgentResult | null>(null); const [error, setError] = useState<string | null>(null);
  const rec = useRef<Recognizer | null>(null); const pending = useRef<Record<string, unknown> | null>(null);
  const busy = useRef(false); const stateRef = useRef(state); stateRef.current = state;
  const routeRef = useRef(loc.pathname); routeRef.current = loc.pathname;

  const stop = useCallback(() => { rec.current?.stop(); stopSpeaking(); pending.current = null; setState("off"); setInterim(""); setResult(null); setError(null); setHeard(""); }, []);
  const listen = useCallback(() => { if (stateRef.current === "off") return; setState("listening"); rec.current?.start(lang); }, [lang]);

  const handle = useCallback(async (text: string) => {
    if (busy.current || stateRef.current === "off") return;
    busy.current = true; rec.current?.stop(); setHeard(text); setInterim(""); setError(null); setState("thinking");
    try {
      const m = routeRef.current.match(/^\/browse\/([^/?]+)/);
      const r = await askAgent(text, /[\u0B80-\u0BFF]/.test(text) ? "ta" : lang, pending.current, { current_node: m?.[1] ?? null, route: routeRef.current });
      setResult(r);
      pending.current = r.action === "ask" ? r.pending : null;
      if (r.action === "navigate" || r.action === "refine") nav(browseUrl(r.node!, r.filters));
      else if (r.action === "back") nav(-1);
      const say = r.question ? r.question.text[r.lang] : r.reply[r.lang];
      if (r.action === "stop") { await speak(say, r.lang); stop(); return; }
      setState("speaking"); await speak(say, r.lang);
      if ((stateRef.current as VoiceState) !== "off") listen();
    } catch (e) {
      setError(String((e as Error).message) === "rate" ? "rate" : "network"); setState("listening"); rec.current?.start(lang);
    } finally { busy.current = false; }
  }, [lang, listen, nav, stop]);

  const toggle = useCallback(() => {
    if (stateRef.current !== "off") { stop(); return; }
    const r = rec.current ?? createRecognizer(); rec.current = r;
    if (!r.supported) { setError("unsupported"); setState("error"); return; }
    r.onInterim = (t) => setInterim(t); r.onFinal = (t) => void handle(t);
    r.onError = (c) => { setError(c === "not-allowed" || c === "service-not-allowed" ? "denied" : c); if (c === "not-allowed") { r.stop(); setState("error"); } };
    setResult(null); setHeard(""); stateRef.current = "listening"; setState("listening"); r.start(lang);
  }, [handle, lang, stop]);

  useEffect(() => { if (!user && stateRef.current !== "off") stop(); }, [user, stop]);
  useEffect(() => () => { rec.current?.stop(); }, []);
  // language switch while listening: restart recognizer in the new language
  useEffect(() => { if (stateRef.current === "listening") rec.current?.start(lang); }, [lang]);

  const choose = useCallback((label: string) => void handle(label), [handle]);
  return (
    <VoiceCtx.Provider value={{ state, toggle, enabled: !!user }}>
      {children}
      {state !== "off" && <VoicePill state={state} interim={interim} heard={heard} result={result} error={error} lang={lang} onClose={stop} onChoose={choose} />}
    </VoiceCtx.Provider>
  );
}
