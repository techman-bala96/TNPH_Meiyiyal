import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import seed from "./seed.json";

export type I18nName = { en: string; ta?: string; [lang: string]: string | undefined };
export type TaxNode = { slug: string; parent: string | null; kind: string; name: I18nName; icon: string | null; sort: number };

/** Whole active tree (a few hundred rows). DB is the source of truth; bundled seed is the offline fallback. */
export function useTaxonomy() {
  return useQuery({
    queryKey: ["taxonomy"],
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<TaxNode[]> => {
      const { data, error } = await supabase.from("taxonomy_nodes").select("slug,parent_slug,kind,name_i18n,icon,sort").eq("is_active", true).order("sort");
      if (error || !data) return seed as TaxNode[];
      return data.map((r) => ({ slug: r.slug, parent: r.parent_slug, kind: r.kind, name: r.name_i18n as I18nName, icon: r.icon, sort: r.sort }));
    },
  });
}
export const childrenOf = (all: TaxNode[], parent: string | null) => all.filter((n) => n.parent === parent).sort((a, b) => a.sort - b.sort);
export const pathTo = (all: TaxNode[], slug: string | null): TaxNode[] => {
  const out: TaxNode[] = [];
  let cur = slug ? all.find((n) => n.slug === slug) : undefined;
  while (cur) { out.unshift(cur); const p = cur.parent; cur = p ? all.find((n) => n.slug === p) : undefined; }
  return out;
};
export const nodeName = (n: { name: I18nName }, lang: string) => n.name[lang] || n.name.en;
