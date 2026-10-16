/** Visual identity per top-level profession. New categories fall back to `default` until given a theme. */
export type Theme = {
  key: string;
  hero: string;      // gradient background for hero/cards
  ink: string;       // text colour on hero
  accent: string;    // icon/accent colour on light surfaces
  tile: string;      // tile icon bubble
  ring: string;      // focus/hover ring
  pattern: string;   // CSS background-image for hero texture
  taglineKey: string;
};
const dots = (c: string) => `radial-gradient(${c} 1px, transparent 1.2px)`;
const grid = (c: string) => `linear-gradient(${c} 1px, transparent 1px), linear-gradient(90deg, ${c} 1px, transparent 1px)`;
const diag = (c: string) => `repeating-linear-gradient(135deg, ${c} 0 1px, transparent 1px 10px)`;

export const THEMES: Record<string, Theme> = {
  doctor: { key: "doctor", hero: "bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-600", ink: "text-white", accent: "text-teal-600",
    tile: "bg-teal-50 text-teal-600", ring: "hover:ring-teal-300", pattern: dots("rgba(255,255,255,.22)"), taglineKey: "browse.tagline.doctor" },
  lawyer: { key: "lawyer", hero: "bg-gradient-to-br from-slate-800 via-indigo-900 to-slate-900", ink: "text-amber-50", accent: "text-amber-600",
    tile: "bg-amber-50 text-amber-700", ring: "hover:ring-amber-300", pattern: diag("rgba(251,191,36,.12)"), taglineKey: "browse.tagline.lawyer" },
  engineer: { key: "engineer", hero: "bg-gradient-to-br from-sky-700 via-blue-700 to-indigo-700", ink: "text-white", accent: "text-orange-600",
    tile: "bg-orange-50 text-orange-600", ring: "hover:ring-orange-300", pattern: grid("rgba(255,255,255,.12)"), taglineKey: "browse.tagline.engineer" },
  default: { key: "default", hero: "bg-gradient-to-br from-primary to-emerald-700", ink: "text-white", accent: "text-primary",
    tile: "bg-primary/10 text-primary", ring: "hover:ring-primary/40", pattern: dots("rgba(255,255,255,.18)"), taglineKey: "browse.tagline.default" },
};
/** Theme from the path: the first `category` node's last slug segment (e.g. professionals--doctor -> doctor). */
export function themeFor(path: { slug: string; kind: string }[]): Theme {
  const cat = path.find((n) => n.kind === "category");
  return (cat && THEMES[cat.slug.split("--").pop()!]) || THEMES.default;
}
export const patternStyle = (t: Theme) => ({ backgroundImage: t.pattern, backgroundSize: t.key === "engineer" ? "18px 18px" : t.key === "doctor" ? "14px 14px" : undefined });
