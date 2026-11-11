import { NgTemplateOutlet } from "@angular/common";
import { Component, computed, inject, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { Subject, combineLatest, debounceTime } from "rxjs";
import { CATEGORIES, CITIES, FACET_LABELS, money, type Place, type PlaceFacet } from "./data";
import { DiscoveryFilters, discoveryQuery, filterPlaces, mapQuery, parseDiscoveryFilters } from "./discovery";
import { Icon } from "./icon";
import { PlaceCard } from "./place-card";
import { TravelStore } from "./store";

const QUICK_FACETS = [
  { id: "always-open", icon: "fa-clock" },
  { id: "wifi", icon: "fa-wifi" },
  { id: "outdoor", icon: "fa-tree" },
  { id: "takeaway", icon: "fa-bag-shopping" },
  { id: "wheelchair", icon: "fa-wheelchair" },
] satisfies { id: PlaceFacet; icon: string }[];

const LINKED_FACETS = [
  { id: "hotel", icon: "fa-hotel" },
  { id: "homestay", icon: "fa-house" },
  { id: "viewpoint", icon: "fa-binoculars" },
] satisfies { id: PlaceFacet; icon: string }[];

const districtOrder = new Intl.Collator("vi", { numeric: true });

@Component({
  standalone: true,
  imports: [RouterLink, FormsModule, NgTemplateOutlet, Icon, PlaceCard],
  templateUrl: "./explore.html",
  host: { class: "didaune-ui" },
})
export class Explore {
  readonly store = inject(TravelStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly searchChanges = new Subject<void>();

  readonly mode = signal("explore");
  readonly filters = signal<DiscoveryFilters>(parseDiscoveryFilters(new URLSearchParams()));
  readonly mobileFilterOpen = signal(false);
  readonly page = signal(1);
  readonly pageSize = 18;
  readonly city = CITIES.hcm;
  readonly categories = CATEGORIES;
  readonly categoryLabels = Object.fromEntries(CATEGORIES.map(category => [category.id, category.name]));
  readonly facetLabels = FACET_LABELS;
  readonly money = money;
  readonly failedFavoritePhotos = signal<ReadonlySet<string>>(new Set());
  readonly activeChip = "border-slate-900 bg-slate-900 text-white";
  readonly idleChip = "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50";
  readonly quickFacets = computed(() => [
    ...QUICK_FACETS,
    ...LINKED_FACETS.filter(facet => facet.id === this.filters().facet),
  ]);
  readonly districts = computed(() => [...new Set(this.store.places().flatMap(place =>
    place.sourceDistrict ? [place.sourceDistrict] : []))].sort((a, b) => a.localeCompare(b, "vi", { numeric: true })));
  readonly districtChoices = computed(() => {
    const district = this.filters().district;
    const districts = this.districts();
    return district && !districts.includes(district) ? [district, ...districts] : districts;
  });
  searchQuery = "";
  areaQuery = "";

  readonly categoryName = computed(() => CATEGORIES.find(category => category.id === this.filters().category)?.name ?? "Tất cả");
  readonly hasFilters = computed(() => {
    const filters = this.filters();
    return !!(filters.query || filters.area || filters.district || filters.localType || filters.facet || filters.category !== "all" ||
      filters.sort !== "default" || (filters.localOnly && this.mode() !== "local"));
  });
  readonly localPlaces = computed(() => this.store.places().filter(place => place.local));
  readonly localTypes = computed(() => {
    const counts = new Map<string, number>();
    for (const place of this.localPlaces()) {
      const type = place.localProfile?.categoryLabel;
      if (type) counts.set(type, (counts.get(type) ?? 0) + 1);
    }
    return [...counts].map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name, "vi"));
  });
  readonly title = computed(() => this.mode() === "local" ? "Góc Địa Phương" :
    this.mode() === "favorites" ? "Bộ sưu tập của tôi" : "Danh sách khám phá");
  readonly resultTitle = computed(() => this.mode() === "local" ? "Những điểm ghé địa phương" :
    this.mode() === "favorites" ? "Địa điểm đã lưu" : "Địa điểm tại TP. Hồ Chí Minh");

  readonly favoriteIds = computed(() => new Set(this.store.state().favorites));
  readonly favoritePlaces = computed(() => this.store.places().filter(place => this.favoriteIds().has(place.id)));
  readonly missingFavorites = computed(() => {
    const knownIds = new Set(this.favoritePlaces().map(place => place.id));
    return this.store.state().favorites.filter(id => !knownIds.has(id));
  });
  readonly filtered = computed(() => {
    if (this.mode() !== "favorites") return filterPlaces(this.store.places(), this.filters());
    const saved = filterPlaces(this.favoritePlaces(), this.filters());
    return saved.sort((a, b) => {
      if (!a.sourceDistrict) return b.sourceDistrict ? 1 : 0;
      if (!b.sourceDistrict) return -1;
      return districtOrder.compare(a.sourceDistrict, b.sourceDistrict);
    });
  });
  readonly pageCount = computed(() => Math.max(1, Math.ceil(this.filtered().length / this.pageSize)));
  readonly currentPage = computed(() => Math.min(this.page(), this.pageCount()));
  readonly visible = computed(() => this.filtered().slice((this.currentPage() - 1) * this.pageSize, this.currentPage() * this.pageSize));
  readonly favoriteGroups = computed(() => {
    const groups = new Map<string | undefined, Place[]>();
    for (const place of this.visible()) {
      const group = groups.get(place.sourceDistrict) ?? [];
      group.push(place);
      groups.set(place.sourceDistrict, group);
    }
    return [...groups].map(([district, places]) => ({ district, places }));
  });
  readonly pageNumbers = computed(() => {
    const totalPages = this.pageCount();
    const currentPage = this.currentPage();
    if (totalPages <= 5) return Array.from({ length: totalPages }, (_, index) => index + 1);
    if (currentPage <= 3) return [1, 2, 3, -1, totalPages];
    if (currentPage >= totalPages - 2) return [1, -1, totalPages - 2, totalPages - 1, totalPages];
    return [1, -1, currentPage, -1, totalPages];
  });

  readonly cardContext = computed<Record<string, string | null>>(() => ({
    ...discoveryQuery(this.filters()),
    page: this.currentPage() > 1 ? String(this.currentPage()) : null,
    from: this.mode() === "local" ? "/goc-dia-phuong" : this.mode() === "favorites" ? "/yeu-thich" : "/kham-pha",
  }));
  readonly mapParams = computed(() => mapQuery({ get: name => this.cardContext()[name] ?? null }));

  favoriteMapParams(id: string) {
    return { ...this.mapParams(), place: id };
  }

  markFavoritePhotoFailed(src: string) {
    this.failedFavoritePhotos.update(failed => new Set(failed).add(src));
  }

  constructor() {
    combineLatest([this.route.data, this.route.queryParamMap]).pipe(takeUntilDestroyed()).subscribe(([data, params]) => {
      this.mode.set(data["mode"] ?? "explore");
      const filters = parseDiscoveryFilters(params);
      this.filters.set({ ...filters, localOnly: this.mode() === "local" || filters.localOnly });
      this.store.query.set(filters.query);
      if (this.searchQuery.trim() !== filters.query) this.searchQuery = filters.query;
      if (this.areaQuery.trim() !== (filters.area ?? "")) this.areaQuery = filters.area ?? "";
      const page = Number(params.get("page"));
      this.page.set(Number.isSafeInteger(page) && page > 0 ? page : 1);
    });
    this.searchChanges.pipe(debounceTime(200), takeUntilDestroyed()).subscribe(() => this.submitSearch());
  }

  changeFilters(filters: Record<string, string | null>) {
    if ("q" in filters) this.searchQuery = filters["q"] ?? "";
    if ("area" in filters) this.areaQuery = filters["area"] ?? "";
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { q: this.searchQuery.trim() || null, area: this.areaQuery.trim() || null, ...filters, page: null },
      queryParamsHandling: "merge", replaceUrl: true,
    });
  }

  selectScope(local: boolean) {
    this.changeFilters(local ? { local: "1", facet: null } : { local: null, localType: null, facet: null });
  }

  selectFacet(facet: PlaceFacet) {
    this.changeFilters({ facet: this.filters().facet === facet ? null : facet, local: null, localType: null });
  }

  clearFilters() {
    this.changeFilters({ q: null, area: null, district: null, category: null, sort: null, local: null, localType: null, facet: null });
  }

  queueSearch(field: "query" | "area", value: string) {
    if (field === "query") this.searchQuery = value;
    else this.areaQuery = value;
    this.searchChanges.next();
  }

  submitSearch() {
    this.changeFilters({});
  }

  changePage(page: number) {
    if (page < 1 || page > this.pageCount()) return;
    void this.router.navigate([], {
      relativeTo: this.route, queryParams: { page: page === 1 ? null : page }, queryParamsHandling: "merge", replaceUrl: true,
    });
  }
}
