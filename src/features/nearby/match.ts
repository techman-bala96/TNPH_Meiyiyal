// Instant search suggestions from the taxonomy (names in EN/TA + everyday synonyms). Pure: no React, no imports,
// so the unit tests can load it directly. The agent (/agent/parse) still decides on Enter; this only powers typing.

export type MatchNode = { slug: string; parent: string | null; kind: string; name: { en: string; ta?: string; [k: string]: string | undefined }; synonyms?: string[] };
export type Suggestion = { slug: string; score: number; via: string | null };

const PULLI = "\u0bcd";
export function norm(s: string): string {
  return (s || "").normalize("NFC").toLowerCase().replace(/[\u200b-\u200d]/g, "")
    .replace(/[,.!?;:"'’‘“”()[\]{}/\\|&-]+/g, " ").replace(/\s+/g, " ").trim();
}
const isTa = (s: string) => /[\u0B80-\u0BFF]/.test(s);
// Tamil adds case endings (நாய் → நாய்க்கு): match on the stem without the final pulli.
const stem = (s: string) => (isTa(s) && s.endsWith(PULLI) ? s.slice(0, -1) : s);
const wordRe = (w: string) => new RegExp(`(^|\\s)${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(es|s)?(\\s|$)`);

function scoreTerm(q: string, term: string): number {
  const t = norm(term); if (!t) return 0;
  if (t === q) return 120;
  if (t.startsWith(q)) return 100 - Math.min(20, t.length - q.length);
  if (q.length >= 2 && t.split(" ").some((w) => w.startsWith(q))) return 85 - Math.min(15, t.length - q.length);
  // the query is a sentence that mentions the term ("my dog is sick" → dog)
  const st = stem(t);
  if (st.length >= 3 && (isTa(st) ? q.includes(st) : wordRe(st).test(q))) return 70 + Math.min(20, st.length);
  if (q.length >= 3 && t.includes(q)) return 50;
  return 0;
}

/** Best nodes for what the user is typing; skips the root group. More specific nodes win ties. */
export function suggest(query: string, nodes: MatchNode[], limit = 6): Suggestion[] {
  const q = norm(query); if (q.length < 2 && !isTa(q)) return [];
  const out: Suggestion[] = [];
  for (const n of nodes) {
    if (!n.parent) continue;
    let best = 0; let via: string | null = null;
    const names = [n.name.en, n.name.ta].filter(Boolean) as string[];
    for (const nm of names) { const s = scoreTerm(q, nm); if (s > best) { best = s; via = null; } }
    for (const syn of n.synonyms ?? []) { const s = scoreTerm(q, syn) - 2; if (s > best) { best = s; via = syn; } }
    if (best > 0) out.push({ slug: n.slug, score: best + (n.kind === "specialty" ? 2 : n.kind === "subcategory" ? 1 : 0), via });
  }
  out.sort((a, b) => b.score - a.score || a.slug.length - b.slug.length);
  // a parent and its child both matching on the same word: keep the child only when it scored at least as well
  const kept: Suggestion[] = [];
  for (const s of out) {
    if (kept.some((k) => k.slug.startsWith(s.slug + "--") && k.score >= s.score)) continue;
    kept.push(s); if (kept.length >= limit) break;
  }
  return kept;
}

/** Shown distance: "< 1 km" under a kilometre, otherwise whole km (the server already rounds). */
export function kmLabel(km: number | null | undefined, lang: "en" | "ta"): string {
  if (km == null || Number.isNaN(Number(km))) return "";
  const n = Math.round(Number(km));
  if (n < 1) return lang === "ta" ? "1 கி.மீ.க்குள்" : "< 1 km";
  return lang === "ta" ? `${n} கி.மீ` : `${n} km`;
}
