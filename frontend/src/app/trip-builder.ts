import { Component, computed, effect, inject, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { Router, RouterLink } from "@angular/router";
import { Icon } from "./icon";
import { appendTripPoint, removeTripPoint, swapTripPoints, validTripCover, validateTripDraft, type TripItem } from "./logic";
import { WorkflowPlacePicker } from "./proposal-form";
import { TravelStore } from "./store";
import { PlannerTripForm } from "./didaune/planner/shared/planner-trip-form";

const DRAFT_KEY = "travelgo-trip-builder-v1";
const EMPTY_DRAFT = {
  name: "", date: "", endDate: "", note: "", cover: "", budget: null as number | null,
  points: [] as TripItem[],
};

function restoreDraft(): typeof EMPTY_DRAFT {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return EMPTY_DRAFT;
    const saved = JSON.parse(raw) as typeof EMPTY_DRAFT;
    return {
      ...EMPTY_DRAFT,
      name: typeof saved.name === "string" ? saved.name : "",
      note: typeof saved.note === "string" ? saved.note : "",
      date: typeof saved.date === "string" ? saved.date : "",
      endDate: typeof saved.endDate === "string" ? saved.endDate : "",
      budget: typeof saved.budget === "number" ? saved.budget : null,
      cover: validTripCover(saved.cover) ? saved.cover : "",
      points: saved.points.filter(item => item && typeof item.placeId === "string" && typeof item.time === "string").slice(0, 5),
    };
  } catch {
    return EMPTY_DRAFT;
  }
}

@Component({
  standalone: true,
  imports: [FormsModule, RouterLink, Icon, WorkflowPlacePicker, PlannerTripForm],
  host: { class: "didaune-ui" },
  templateUrl: "./trip-builder.html",
  styleUrl: "./trip-builder.css",
})
export class TripBuilder {
  readonly store = inject(TravelStore);
  private readonly router = inject(Router);
  readonly draft = signal(restoreDraft());
  readonly saving = signal(false);
  readonly coverReading = signal(false);
  readonly pointError = signal("");
  readonly editError = signal("");
  readonly feedback = signal("");
  readonly draftStorageFailed = signal(false);
  private readonly saved = signal(false);
  private readonly placeById = computed(() => new Map(this.store.places().map(place => [place.id, place])));
  readonly stops = computed(() => this.draft().points.map(point => ({ ...point, place: this.placeById().get(point.placeId) })));

  constructor() {
    effect(() => {
      if (this.saved()) return;
      const value = this.draft();
      try {
        sessionStorage.setItem(DRAFT_KEY, JSON.stringify(value));
        this.draftStorageFailed.set(false);
      } catch {
        this.draftStorageFailed.set(true);
      }
    });
  }

  set<K extends keyof typeof EMPTY_DRAFT>(key: K, value: (typeof EMPTY_DRAFT)[K]) {
    this.draft.update(draft => ({ ...draft, [key]: value }));
  }

  addPoint(id: string) {
    this.feedback.set("");
    const place = this.placeById().get(id);
    if (!place || place.demoChange?.status) {
      this.pointError.set("Điểm này hiện chưa thể thêm. Hãy chọn một địa điểm khác.");
      return;
    }
    const points = appendTripPoint(this.draft().points, id, this.store.places());
    if (typeof points === "string") {
      this.pointError.set(points);
      return;
    }
    this.pointError.set("");
    this.set("points", points);
    this.feedback.set(`Đã thêm ${place.name}.`);
  }

  editPoint(id: string, field: "time" | "note" | "date", value: string) {
    this.set("points", this.draft().points.map(point => point.placeId === id ? { ...point, [field]: value } : point));
  }

  editCost(id: string, estimatedCost: number | null) {
    this.set("points", this.draft().points.map(point => point.placeId === id ? { ...point, estimatedCost } : point));
  }

  move(index: number, offset: -1 | 1) {
    const points = this.draft().points;
    const target = points[index + offset];
    if (target) this.set("points", swapTripPoints(points, points[index].placeId, target.placeId));
  }

  remove(id: string) {
    this.set("points", removeTripPoint(this.draft().points, id));
    this.pointError.set("");
    this.feedback.set("Đã bỏ điểm ghé khỏi bản nháp.");
  }

  async save() {
    if (this.saving() || this.coverReading()) return;
    const trip = { ...this.draft(), source: "manual" as const };
    const error = validateTripDraft(trip);
    if (error) {
      this.editError.set(error);
      return;
    }
    this.saving.set(true);
    this.editError.set("");
    try {
      if (!(await this.store.createTrip(trip))) {
        this.editError.set("Chưa lưu được lịch trình. Kiểm tra các điểm ghé và thông tin đã nhập rồi thử lại.");
        return;
      }
      this.saved.set(true);
      try { sessionStorage.removeItem(DRAFT_KEY); }
      catch { /* IndexedDB has already saved the itinerary. */ }
      await this.router.navigate(["/lich-trinh", "chinh-sua"]);
    } finally {
      this.saving.set(false);
    }
  }
}
