import { supabase } from "@/integrations/supabase/client";

export type I18nText = { en: string; ta: string };
export type AgentFilters = { online_only: boolean; sort: "distance" | "rating" | "experience" | null; show_all: boolean; max_km: number | null; district: string | null;
  area: { name: string; name_ta?: string | null; lat: number; lng: number; district: string } | null; exclude_nodes: string[]; exclude_names: string[] };
export type AgentResult = { action: "navigate" | "refine" | "ask" | "stop" | "back" | "help" | "none"; node: string | null; node_name: I18nText | null; filters: AgentFilters;
  question: { slot: string; text: I18nText; options: { value: string; label: I18nText }[] } | null; pending: Record<string, unknown> | null; reply: I18nText; lang: "en" | "ta"; source: string };

const BASE = (import.meta.env.VITE_AGENT_URL as string | undefined) ?? "";

export async function askAgent(text: string, lang: "en" | "ta", pending: Record<string, unknown> | null, context: Record<string, unknown>): Promise<AgentResult> {
  const { data } = await supabase.auth.getSession();
  const res = await fetch(`${BASE}/agent/parse`, {
    method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${data.session?.access_token ?? ""}` },
    body: JSON.stringify({ text, lang, pending, context }),
  });
  if (!res.ok) throw new Error(res.status === 429 ? "rate" : `agent ${res.status}`);
  return res.json();
}

/** Worker-list URL that encodes the agent's filters (the list reads them back from the query string). */
export function browseUrl(node: string, f: AgentFilters): string {
  const q = new URLSearchParams({ list: "1" });
  if (f.online_only) q.set("online", "1");
  if (f.sort) q.set("sort", f.sort);
  if (f.show_all) q.set("all", "1");
  if (f.max_km) q.set("km", String(f.max_km));
  if (f.district) q.set("district", f.district);
  if (f.area) q.set("near", `${f.area.lat.toFixed(5)},${f.area.lng.toFixed(5)},${f.area.name}`);
  if (f.exclude_nodes.length) q.set("xn", f.exclude_nodes.join(","));
  if (f.exclude_names.length) q.set("xw", f.exclude_names.join(","));
  return `/browse/${node}?${q.toString()}`;
}
