import { supabase } from "@/integrations/supabase/client";
import { USE_MOCKS } from "./config";
import seed from "@/data/taxonomy.json";
import type { I18nName } from "./i18nName";

export type TaxNode = {
  slug: string; parent: string | null; kind: string; name: I18nName; icon: string | null; sort: number;
};

let cache: TaxNode[] | null = null;

/** Loads the whole active tree once (≈ a few hundred rows); DB is source of truth, JSON is the offline/mock fallback. */
export async function loadTaxonomy(): Promise<TaxNode[]> {
  if (cache) return cache;
  if (!USE_MOCKS) {
    const { data, error } = await supabase
      .from("taxonomy_nodes" as never)
      .select("slug,parent_slug,kind,name_i18n,icon,sort")
      .eq("is_active", true)
      .order("sort");
    if (!error && data) {
      cache = (data as Array<Record<string, unknown>>).map((r) => ({
        slug: r.slug as string, parent: (r.parent_slug as string) ?? null, kind: r.kind as string,
        name: r.name_i18n as I18nName, icon: (r.icon as string) ?? null, sort: r.sort as number,
      }));
      return cache;
    }
  }
  cache = seed as TaxNode[];
  return cache;
}

export const childrenOf = (all: TaxNode[], parent: string | null) =>
  all.filter((n) => n.parent === parent).sort((a, b) => a.sort - b.sort);

export const pathTo = (all: TaxNode[], slug: string | null): TaxNode[] => {
  const out: TaxNode[] = [];
  let cur = slug ? all.find((n) => n.slug === slug) : undefined;
  while (cur) { out.unshift(cur); cur = cur.parent ? all.find((n) => n.slug === cur!.parent) : undefined; }
  return out;
};
