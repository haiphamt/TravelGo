import { CATEGORIES, isPlaceFacet } from "./data.ts";
import type { Category, Place, PlaceFacet } from "./data";
import { normalize } from "./logic.ts";

export interface DiscoveryFilters {
  query: string;
  area?: string;
  district?: string;
  category: Category;
  localOnly: boolean;
  sort: "default" | "name" | "price";
  localType?: string;
  facet?: PlaceFacet;
}

export function parseDiscoveryFilters(params: { get(name: string): string | null }): DiscoveryFilters {
  const category = params.get("category");
  const sort = params.get("sort");
  const area = params.get("area")?.trim();
  const district = params.get("district")?.trim();
  const rawType = params.get("localType")?.trim();
  const localType = rawType && rawType.length <= 80 ? rawType : undefined;
  const facet = params.get("facet");
  return {
    query: (params.get("q") ?? "").trim(),
    category: CATEGORIES.some((item) => item.id === category) ? category as Category : "all",
    localOnly: params.get("local") === "1" || !!localType,
    sort: sort === "name" || sort === "price" ? sort : "default",
    ...(area ? {area} : {}),
    ...(district && district.length <= 80 ? {district} : {}),
    ...(localType ? {localType} : {}),
    ...(isPlaceFacet(facet) ? {facet} : {}),
  };
}

export function filterPlaces(places: readonly Place[], filters: DiscoveryFilters): Place[] {
  const query = normalize(filters.query);
  const area = normalize(filters.area ?? "");
  const district = normalize(filters.district ?? "");
  const results = places.filter((place) =>
    (!filters.localOnly || place.local) &&
    (filters.category === "all" || place.category === filters.category) &&
    (!filters.localType || (place.local && place.localProfile?.categoryLabel === filters.localType)) &&
    (!filters.facet || matchesFacet(place, filters.facet)) &&
    (!area || (place.area !== "Chưa cập nhật địa chỉ" && normalize(place.area).includes(area))) &&
    (!district || normalize(place.sourceDistrict ?? "") === district) &&
    (!query || normalize([place.name, ...place.products, place.area].join(" ")).includes(query)));
  if (filters.sort === "name") results.sort((a, b) => a.name.localeCompare(b.name, "vi"));
  if (filters.sort === "price") results.sort((a, b) => {
    if (a.price === null) return b.price === null ? 0 : 1;
    return b.price === null ? -1 : a.price - b.price;
  });
  if (filters.sort === "default" && !filters.localOnly) {
    // Keep the same order on the directory and map so their page context matches.
    results.sort((a, b) => Number(!!b.photoSource) - Number(!!a.photoSource) || Number(!!b.image) - Number(!!a.image));
  }
  return results;
}

function matchesFacet(place: Place, facet: PlaceFacet): boolean {
  if (facet === "always-open") return place.hours?.trim() === "24/7" && !place.demoChange?.status;
  return place.facets?.includes(facet) ?? false;
}

export function discoveryQuery(filters: DiscoveryFilters): Record<string, string | null> {
  return {
    q: filters.query.trim() || null,
    category: filters.category === "all" ? null : filters.category,
    local: filters.localOnly ? "1" : null,
    sort: filters.sort === "default" ? null : filters.sort,
    ...(filters.area ? {area: filters.area} : {}),
    ...(filters.district ? {district: filters.district} : {}),
    ...(filters.localType ? {localType: filters.localType} : {}),
    ...(filters.facet ? {facet: filters.facet} : {}),
  };
}

export function mapQuery(params: { get(name: string): string | null }, placeId?: string): Record<string, string | null> {
  const query = discoveryQuery(parseDiscoveryFilters(params));
  if (params.get("from") === "/goc-dia-phuong" || params.get("origin") === "local") {
    query["origin"] = "local";
    query["local"] = "1";
  }
  const page = Number(params.get("page"));
  if (Number.isSafeInteger(page) && page > 0) query["page"] = String(page);
  if (placeId) query["place"] = placeId;
  return query;
}
