import categoriesJson from "../reference/krisha/categories.json";
import geoJson from "../reference/krisha/geo.json";
import { CATEGORY_ALIASES, EXTRA_GEO_NODES, GEO_ALIASES } from "./aliases";
import { containsNormalizedPhrase, normalizeText } from "../shared/text";

export type SupportedCategorySlug =
  | "prodazha/kvartiry"
  | "prodazha/uchastkov"
  | "prodazha/doma-dachi"
  | "prodazha/kommercheskaya-nedvizhimost";

export type GeoNode = {
  name: string;
  slug: string;
  type: string;
  url_path: string;
  parent_url_path: string | null;
  verified: boolean;
  in_sitemap: boolean;
  name_source: string;
  note?: string;
};

type GeoReference = {
  nodes: GeoNode[];
};

type Category = {
  slug: string;
  name: string;
};

type CategoryReference = {
  categories: Category[];
};

export const geoNodes = [...(geoJson as GeoReference).nodes, ...(EXTRA_GEO_NODES as GeoNode[])];
export const categories = (categoriesJson as CategoryReference).categories;

const geoByPath = new Map(geoNodes.map((node) => [node.url_path, node]));
const categoryBySlug = new Map(categories.map((category) => [category.slug, category]));

const sortedGeoAliases = [...GEO_ALIASES].sort((a, b) => b[0].length - a[0].length);
const sortedCategoryAliases = [...CATEGORY_ALIASES].sort((a, b) => b[0].length - a[0].length);

export function getGeoByPath(urlPath: string): GeoNode | undefined {
  return geoByPath.get(urlPath);
}

export function getCategoryName(slug: SupportedCategorySlug): string {
  return categoryBySlug.get(slug)?.name ?? slug;
}

export function resolveGeoFromText(text: string): GeoNode | null {
  for (const [alias, path] of sortedGeoAliases) {
    if (containsNormalizedPhrase(text, alias)) {
      return getGeoByPath(path) ?? null;
    }
  }

  const normalized = normalizeText(text);
  for (const node of geoNodes) {
    if (containsNormalizedPhrase(normalized, node.name) || containsNormalizedPhrase(normalized, node.slug)) {
      return node;
    }
  }

  return null;
}

export function resolveCategoryFromText(text: string): SupportedCategorySlug | null {
  for (const [alias, slug] of sortedCategoryAliases) {
    if (containsNormalizedPhrase(text, alias)) {
      return slug;
    }
  }

  return null;
}
