import { Component, computed, inject, signal } from "@angular/core";
import { RouterLink } from "@angular/router";
import type { Category, PlaceFacet } from "./data";
import { filterPlaces, type DiscoveryFilters } from "./discovery";
import { normalize } from "./logic";
import { PlaceCard } from "./place-card";
import { RecentPlaces } from "./recent-places";
import { TravelStore } from "./store";

interface HomeCategory {
  id: string;
  name: string;
  heading?: string;
  icon: string;
  color: string;
  category: Category;
  facet?: PlaceFacet;
}
const homeCategories: readonly HomeCategory[] = [
  { id: "coffee", name: "Quán cà phê", heading: "Cà phê", icon: "fa-mug-hot", color: "text-orange-500", category: "coffee" },
  { id: "hotel", name: "Khách sạn", icon: "fa-bed", color: "text-sky-600", category: "all", facet: "hotel" },
  { id: "homestay", name: "Homestay", icon: "fa-house", color: "text-emerald-600", category: "all", facet: "homestay" },
  { id: "food", name: "Ăn uống", icon: "fa-utensils", color: "text-amber-500", category: "food" },
  { id: "nature", name: "Công viên", icon: "fa-tree", color: "text-emerald-700", category: "nature" },
  { id: "culture", name: "Tham quan", icon: "fa-landmark", color: "text-blue-600", category: "culture" },
  { id: "wifi", name: "Có Wi-Fi", icon: "fa-wifi", color: "text-teal-600", category: "all", facet: "wifi" },
  { id: "outdoor", name: "Ngoài trời", icon: "fa-umbrella-beach", color: "text-violet-600", category: "all", facet: "outdoor" },
  { id: "viewpoint", name: "View đẹp", icon: "fa-mountain-sun", color: "text-sky-600", category: "all", facet: "viewpoint" },
  { id: "drink", name: "Đồ uống", icon: "fa-martini-glass-citrus", color: "text-teal-600", category: "drink" },
];
const voucherPreviews = [
  { title: "Combo món Việt", offer: "89.000đ", image: "/vouchers/mon-viet.webp", color: "food" },
  { title: "Cà phê sữa đá", offer: "Giảm 15%", image: "/vouchers/ca-phe.webp", color: "coffee" },
  { title: "Trà trái cây", offer: "25.000đ", image: "/vouchers/tra-trai-cay.webp", color: "drink" },
];

// Template and quick menu adapted from Didaune features/home at 04597f6.
@Component({
  standalone: true,
  imports: [RouterLink, PlaceCard],
  host: { class: "didaune-ui didaune-home" },
  templateUrl: "./home.html",
  styleUrl: "./home.css",
})
export class Home {
  readonly store = inject(TravelStore);
  readonly recentPlaces = inject(RecentPlaces);
  readonly recentlyViewed = computed(() => {
    const ids = this.recentPlaces.ids();
    if (!ids.length) return [];
    const byId = new Map(this.store.places().map(place => [place.id, place]));
    return ids.flatMap(id => {
      const place = byId.get(id);
      return place ? [place] : [];
    });
  });
  readonly homeCategoryOptions = homeCategories;
  readonly voucherPreviews = voucherPreviews;
  readonly selectedHomeCategory = signal("coffee");
  readonly quickMenuExpanded = signal(false);
  readonly activeHomeCategory = computed(() =>
    this.homeCategoryOptions.find(category => category.id === this.selectedHomeCategory())!);
  readonly localPlaces = computed(() => this.store.places().filter(place => place.local));
  readonly numberFormat = new Intl.NumberFormat("vi-VN");
  readonly demandCategories = computed(() => {
    const counts = new Map<Category | PlaceFacet, number>();
    for (const place of this.store.places()) {
      counts.set(place.category, (counts.get(place.category) ?? 0) + 1);
      for (const facet of place.facets ?? []) counts.set(facet, (counts.get(facet) ?? 0) + 1);
    }
    return this.homeCategoryOptions.map(category => ({
      ...category,
      count: this.numberFormat.format(counts.get(category.facet ?? category.category) ?? 0),
    }));
  });
  private readonly suggestionFilters = computed<DiscoveryFilters>(() => ({
    query: "",
    category: this.activeHomeCategory().category,
    facet: this.activeHomeCategory().facet,
    localOnly: false,
    sort: "default",
  }));
  readonly suggestedPlaces = computed(() =>
    filterPlaces(this.store.places(), this.suggestionFilters()).filter(place => place.image).slice(0, 8));
  readonly suggestionContext = computed(() => this.categoryContext(this.activeHomeCategory()));
  readonly interestedPlaces = computed(() => {
    const savedIds = new Set(this.store.state().favorites);
    return filterPlaces(this.store.places().filter(place => savedIds.has(place.id)), this.suggestionFilters()).slice(0, 2);
  });
  readonly featuredAreas = computed(() => {
    const areas = new Map<string, { name: string; count: number }>();
    for (const place of this.store.places()) {
      if (!place.sourceDistrict) continue;
      const key = normalize(place.sourceDistrict);
      const area = areas.get(key);
      areas.set(key, { name: area?.name ?? place.sourceDistrict, count: (area?.count ?? 0) + 1 });
    }
    return [...areas.values()]
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "vi"))
      .slice(0, 6);
  });

  categoryContext(category: HomeCategory) {
    return { category: category.category === "all" ? null : category.category, facet: category.facet ?? null };
  }
}
