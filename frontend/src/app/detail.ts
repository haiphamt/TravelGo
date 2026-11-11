import { Component, computed, effect, inject, signal, untracked } from "@angular/core";
import { ActivatedRoute, RouterLink } from "@angular/router";
import { DatePipe } from "@angular/common";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { CATEGORIES, FACET_LABELS, Place, money } from "./data";
import { TravelStore } from "./store";
import { Icon } from "./icon";
import { mapsLink } from "./logic";
import { discoveryQuery, mapQuery, parseDiscoveryFilters } from "./discovery";
import { hasCoordinates } from "./geo";
import { PhotoGallery } from "./photo-gallery";
import { WorkflowStore } from "./workflow-store";
import { RecentPlaces } from "./recent-places";

const osmCatalogDescription = /^Địa điểm (?:cà phê|ăn uống|đồ uống|tham quan|lưu trú|công viên hoặc vườn) trong dữ liệu OpenStreetMap\.$/;

@Component({
  standalone: true,
  imports: [RouterLink, Icon, DatePipe, PhotoGallery],
  templateUrl: "./detail.html",
  styleUrl: "./detail.css",
  host: { class: "didaune-ui" },
})
export class Detail {
  store = inject(TravelStore);
  workflow = inject(WorkflowStore);
  route = inject(ActivatedRoute);
  id = signal("");
  params = signal<{get(name: string): string | null}>(new URLSearchParams());
  place = computed(() => this.store.places().find((p) => p.id === this.id()));
  review = computed(() => this.store.visibleReviewFor(this.id()));
  ownReview = computed(() => this.store.reviewFor(this.id()));
  category = computed(() => CATEGORIES.find(category => category.id === this.place()?.category)?.name);
  introduction = computed(() => {
    const place = this.place();
    const description = place?.description.trim() ?? "";
    return place?.id.startsWith("osm:") && osmCatalogDescription.test(description) ? "" : description;
  });
  hours = computed(() => {
    const place = this.place();
    if (!place) return null;
    return place.demoChange?.fields.includes("hours") ? place.hours : place.localProfile?.hours.summary ?? place.hours;
  });
  amenities = computed(() => this.place()?.facets?.filter(facet =>
    facet === "wifi" || facet === "outdoor" || facet === "takeaway" || facet === "wheelchair").map(facet => FACET_LABELS[facet]) ?? []);
  money = money;
  hasCoordinates = hasCoordinates;
  confirmDelete = signal(false);
  backRoute = computed(() => {
    const from = this.params().get("from");
    return from && ["/kham-pha", "/goc-dia-phuong", "/yeu-thich", "/ban-do", "/ho-so-uu-tien"].includes(from)
      ? from : this.place()?.local ? "/goc-dia-phuong" : "/kham-pha";
  });
  backLabel = computed(() => ({"/kham-pha": "Khám phá địa điểm", "/goc-dia-phuong": "Góc Địa Phương", "/yeu-thich": "Địa điểm yêu thích", "/ban-do": "Quay lại bản đồ", "/ho-so-uu-tien": "250 cơ sở ưu tiên"} as Record<string, string>)[this.backRoute()]);
  returnParams = computed<Record<string, string | null>>(() => {
    if (this.backRoute() === "/ho-so-uu-tien") {
      const status = this.params().get("status");
      return {
        status: status && ["licensed", "reference", "missing", "all"].includes(status) ? status : "licensed",
        q: (this.params().get("q") ?? "").slice(0, 180) || null,
      };
    }
    const params = discoveryQuery(parseDiscoveryFilters(this.params()));
    const page = Number(this.params().get("page"));
    if (Number.isSafeInteger(page) && (page > 1 || (page === 1 && this.backRoute() === "/ban-do"))) params["page"] = String(page);
    if (this.backRoute() === "/ban-do") params["place"] = this.id();
    if (this.backRoute() === "/ban-do" && this.params().get("origin") === "local") params["origin"] = "local";
    return params;
  });
  reviewParams = computed<Record<string, string | null>>(() => ({ ...this.returnParams(), from: this.backRoute() }));
  mapParams = computed(() => mapQuery({get: name => this.reviewParams()[name] ?? null}, this.id()));
  weekdayLabel(day: string) { const separator = day.indexOf(":"); return separator >= 0 ? day.slice(0,separator) : "Lịch từ nguồn"; }
  weekdayHours(day: string) { const separator = day.indexOf(":"); return separator >= 0 ? day.slice(separator + 1).trim() : day; }
  directions = (place: Place) => hasCoordinates(place) ? mapsLink([place]) : "";
  coordinates = (place: Place) => hasCoordinates(place) ? `${place.lat.toFixed(5)}, ${place.lng.toFixed(5)}` : "Chưa có tọa độ từ nguồn";
  constructor() {
    const recentPlaces = inject(RecentPlaces);
    effect(() => {
      const place = this.place();
      if (place) untracked(() => recentPlaces.record(place.id));
    });
    this.route.paramMap
      .pipe(takeUntilDestroyed())
      .subscribe((params) => {
        this.id.set(params.get("id") ?? "");
        this.confirmDelete.set(false);
      });
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe(params => this.params.set(params));
  }
  async deleteReview(id: string) {
    if (await this.store.deleteReview(id)) {
      this.confirmDelete.set(false);
      this.store.toast("Đã xóa đánh giá của bạn.");
    }
  }
}
