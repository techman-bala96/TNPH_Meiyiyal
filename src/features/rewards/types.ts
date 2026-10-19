export type I18n = { en: string; ta?: string };
export type Reward = { slug: string; icon: string; color: string; title: I18n; desc?: I18n; cert_no?: string; awarded_at?: string };
export const tr = (x: I18n | null | undefined, lang: string) => (x ? (lang.startsWith("ta") && x.ta) || x.en : "");
export const COLORS: Record<string, { bg: string; fg: string; hex: string }> = {
  sky: { bg: "bg-sky-500/15", fg: "text-sky-700 dark:text-sky-300", hex: "#0284c7" },
  amber: { bg: "bg-amber-500/15", fg: "text-amber-700 dark:text-amber-300", hex: "#d97706" },
  emerald: { bg: "bg-emerald-500/15", fg: "text-emerald-700 dark:text-emerald-300", hex: "#059669" },
  orange: { bg: "bg-orange-500/15", fg: "text-orange-700 dark:text-orange-300", hex: "#ea580c" },
  violet: { bg: "bg-violet-500/15", fg: "text-violet-600 dark:text-violet-300", hex: "#7c3aed" },
  rose: { bg: "bg-rose-500/15", fg: "text-rose-600 dark:text-rose-300", hex: "#e11d48" },
  fuchsia: { bg: "bg-fuchsia-500/15", fg: "text-fuchsia-600 dark:text-fuchsia-300", hex: "#c026d3" },
  teal: { bg: "bg-teal-500/15", fg: "text-teal-600 dark:text-teal-300", hex: "#0d9488" },
};
export const color = (c: string) => COLORS[c] ?? COLORS.amber;
