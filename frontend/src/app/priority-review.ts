import { Component, computed, inject, signal } from "@angular/core";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { CATEGORIES, type Place } from "./data";
import { normalize } from "./logic";
import { PlaceCard } from "./place-card";
import { priorityPlaces } from "./priority-places";
import { TravelStore } from "./store";

type PhotoStatus = "licensed" | "reference" | "missing";
const statusLabels = {
  licensed: "Ảnh có giấy phép",
  reference: "Ảnh tham khảo",
  missing: "Cần thu thập ảnh",
} satisfies Record<PhotoStatus, string>;

@Component({
  standalone: true,
  imports: [RouterLink, PlaceCard],
  templateUrl: "./priority-review.html",
  host: { class: "didaune-ui" },
})
export class PriorityReview {
  readonly store = inject(TravelStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly status = signal("licensed");
  readonly query = signal("");
  readonly limit = signal(24);
  readonly total = priorityPlaces.length;
  readonly labels = statusLabels;
  readonly entries = computed(() => {
    const byId = new Map(this.store.places().map(place => [place.id, place]));
    return priorityPlaces.flatMap(entry => {
      const place = byId.get(entry.id);
      if (!place) return [];
      const status: PhotoStatus = place.photoSource ? "licensed" : place.image ? "reference" : "missing";
      return [{ place, group: entry.group, status }];
    });
  });
  readonly choices = computed(() => [
    { id: "licensed", label: statusLabels.licensed, count: this.entries().filter(entry => entry.status === "licensed").length },
    { id: "reference", label: statusLabels.reference, count: this.entries().filter(entry => entry.status === "reference").length },
    { id: "missing", label: statusLabels.missing, count: this.entries().filter(entry => entry.status === "missing").length },
    { id: "all", label: "Tất cả cơ sở", count: this.entries().length },
  ]);
  readonly filtered = computed(() => {
    const query = normalize(this.query());
    return this.entries().filter(entry =>
      (this.status() === "all" || entry.status === this.status()) &&
      (!query || normalize([entry.place.name, entry.place.area, entry.group].join(" ")).includes(query)));
  });
  readonly visible = computed(() => this.filtered().slice(0, this.limit()));
  readonly context = computed(() => ({ from: "/ho-so-uu-tien", status: this.status(), q: this.query() || null }));
  readonly categoryLabels = Object.fromEntries(CATEGORIES.map(category => [category.id, category.name]));

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe(params => {
      const status = params.get("status");
      this.status.set(status && ["licensed", "reference", "missing", "all"].includes(status) ? status : "licensed");
      this.query.set((params.get("q") ?? "").slice(0, 180));
      this.limit.set(24);
    });
  }

  changeStatus(status: string) {
    void this.router.navigate([], { relativeTo: this.route, queryParams: { status, q: this.query() || null } });
  }

  search(value: string) {
    void this.router.navigate([], { relativeTo: this.route, queryParams: { status: this.status(), q: value.trim().slice(0, 180) || null }, replaceUrl: true });
  }

  source(place: Place) { return place.photoSource?.url ?? place.sourceUrl; }
}
