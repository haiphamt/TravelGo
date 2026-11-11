import type { ChangeKind } from "./workflow.ts";

export type City = "hcm";
export type Category = "all" | "coffee" | "food" | "nature" | "culture" | "drink" | "lodging";
export type PlaceFacet = "always-open" | "wifi" | "outdoor" | "takeaway" | "wheelchair" | "hotel" | "homestay" | "viewpoint";

export const FACET_LABELS: Record<PlaceFacet, string> = {
  "always-open": "Mở 24 giờ",
  wifi: "Có Wi‑Fi",
  outdoor: "Cho ngồi ngoài trời",
  takeaway: "Mang đi",
  wheelchair: "Lối vào xe lăn",
  hotel: "Khách sạn",
  homestay: "Homestay",
  viewpoint: "View đẹp",
};

export const isPlaceFacet = (value: unknown): value is PlaceFacet =>
  typeof value === "string" && Object.hasOwn(FACET_LABELS, value);
export interface LocalProfile {
  categoryLabel: string;
  productsNote: string;
  hours: {
    summary: string | null;
    weekdays: string[];
    sourceLabel: string;
    sourceUrl: string;
    observedAt: string | null;
    qualityFlags: string[];
  };
  collectedAt: string | null;
  preparedAt: string | null;
  sources: { label: string; url: string; updatedAt: string | null }[];
}
export interface Place {
  id: string;
  name: string;
  city: City;
  category: Exclude<Category, "all">;
  local: boolean;
  area: string;
  sourceDistrict?: string;
  price: number | null;
  hours: string | null;
  image: string | null;
  images: string[];
  products: string[];
  description: string;
  lat: number | null;
  lng: number | null;
  updated: string | null;
  sourceUrl: string;
  sourceLabel: string;
  sourceLicense: string;
  sourceUpdatedAt: string | null;
  referenceOnly: boolean;
  photoCredit: string | null;
  photoSource?: { url: string; license: string; licenseUrl: string };
  facets?: PlaceFacet[];
  mobile?: boolean;
  localProfile?: LocalProfile;
  demoChange?: {
    revision: string;
    kind: ChangeKind;
    effectiveFrom: string;
    effectiveUntil: string | null;
    status?: "paused" | "closed";
    fields: string[];
  };
}
export const CITIES: Record<City, string> = { hcm: "TP. Hồ Chí Minh" };
export const CATEGORIES: { id: Category; name: string; icon: string }[] = [
  { id: "all", name: "Tất cả", icon: "grid" },
  { id: "coffee", name: "Cà phê", icon: "coffee" },
  { id: "food", name: "Ăn uống", icon: "utensils" },
  { id: "nature", name: "Công viên", icon: "leaf" },
  { id: "culture", name: "Tham quan", icon: "landmark" },
  { id: "drink", name: "Đồ uống", icon: "coffee" },
  { id: "lodging", name: "Lưu trú", icon: "home" },
];
const currency = new Intl.NumberFormat("vi-VN", {
  style: "currency", currency: "VND", maximumFractionDigits: 0,
});
export const money = (value: number | null) =>
  value === null ? "Chưa cập nhật giá" : currency.format(value);

export function withOsmFacets(places: Place[], sidecar: unknown): Place[] {
  if (!sidecar || typeof sidecar !== "object") return places;
  const byId = recordIndex("places" in sidecar ? sidecar.places : null);
  const districts = recordIndex("districts" in sidecar ? sidecar.districts : null);
  if (!byId && !districts) return places;
  return places.map((place) => {
    if (place.local || !place.id.startsWith("osm:")) return place;
    const tags = byId?.[place.id];
    const facets = Array.isArray(tags) ? tags.filter(isPlaceFacet) : [];
    const district = districts?.[place.id];
    const sourceDistrict = typeof district === "string" && district.length <= 80 ? district.trim() : "";
    return facets.length || sourceDistrict ? {
      ...place,
      ...(facets.length ? { facets } : {}),
      ...(sourceDistrict ? { sourceDistrict } : {}),
    } : place;
  });
}

function recordIndex(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
