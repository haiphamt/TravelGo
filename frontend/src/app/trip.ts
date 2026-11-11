import { Component, computed, inject, signal } from "@angular/core";
import { DatePipe } from "@angular/common";
import { RouterLink } from "@angular/router";
import { TravelStore } from "./store";
import { Icon } from "./icon";
import { money, type Place } from "./data";
import { mapsLink, orderTripDays, removeTripPoint, setTripTime, swapTripPoints, tripDay, validTripBudget, validTripCover, validTripDate, validTripTime } from "./logic";
import { currentTrip, hasActiveTrip } from "./trip-storage";
import { hasCoordinates } from "./geo";
import { WorkflowPlacePicker } from "./proposal-form";
import { PlannerTripForm } from "./didaune/planner/shared/planner-trip-form";

type TripInfo = { name: string; note: string; cover: string; date: string; endDate: string };

// Didaune planner structure at 04597f6, backed by the TravelGo itinerary store.
@Component({
  standalone: true,
  imports: [RouterLink, DatePipe, Icon, WorkflowPlacePicker, PlannerTripForm],
  host: { class: "didaune-ui" },
  styleUrl: "./trip.css",
  templateUrl: "./trip.html",
})
export class Trip {
  store = inject(TravelStore);
  replaceId = signal("");
  replacement = signal("");
  resolving = signal(false);
  addingPoint = signal(false);
  savingPoint = signal(false);
  newPoint = signal("");
  pendingInfo = signal<TripInfo | null>(null);
  coverReading = signal(false);
  savingInfo = signal(false);
  money = money;
  activeTrip = computed(() => currentTrip(this.store.state()));
  tripInfo = computed<TripInfo>(() => {
    const trip = this.activeTrip();
    return this.pendingInfo() ?? { name: trip.name, note: trip.note ?? "", cover: trip.cover ?? "", date: trip.date, endDate: trip.endDate ?? "" };
  });
  hasTrip = computed(() => hasActiveTrip(this.store.state()));
  multiDay = computed(() => Boolean(this.activeTrip().endDate && this.activeTrip().endDate! > this.activeTrip().date));
  total = computed(() => {
    const prices = this.store.tripPlaces().map(item => this.projectedCost(item)).filter((price): price is number => price !== null);
    return prices.length ? prices.reduce((sum, price) => sum + price, 0) : null;
  });
  unavailableTrip = computed(() => this.store.state().trip.filter((item) => !this.store.places().some((place) => place.id === item.placeId)));
  unavailableCount = computed(() => this.unavailableTrip().length);
  unknownPrices = computed(() => this.store.tripPlaces().filter(item => this.projectedCost(item) === null).length + this.unavailableCount());
  missingCoordinates = computed(() => this.store.tripPlaces().filter(item => !hasCoordinates(item.place)).length);
  mapRoutes = computed(() => {
    const days = new Map<string, Place[]>();
    for (const item of this.store.tripPlaces()) {
      if (!hasCoordinates(item.place)) continue;
      const day = this.day(item);
      const points = days.get(day) ?? [];
      points.push(item.place);
      days.set(day, points);
    }
    return [...days].map(([day, points]) => ({ day, url: mapsLink(points) }));
  });
  timeWarning = computed(() =>
    this.store
      .state()
      .trip.some(
        (item, index, items) => index > 0 && this.day(item) === this.day(items[index - 1]) && item.time < items[index - 1].time,
      ),
  );
  day(point: {date?: string}) {
    return tripDay(point, this.activeTrip().date);
  }
  projectedCost(item: { estimatedCost?: number | null; place: Pick<Place, "price"> }) {
    return item.estimatedCost ?? item.place.price;
  }
  neighbor(index: number, offset: number) {
    const points = this.store.tripPlaces();
    const adjacent = points[index + offset];
    return adjacent && this.day(points[index]) === this.day(adjacent) ? adjacent.placeId : null;
  }
  async openTrip(event: Event) {
    const select = event.target as HTMLSelectElement;
    if (this.pendingInfo() || this.coverReading()) {
      this.store.toast("Lưu thông tin chuyến đang mở trước khi chuyển lịch trình.");
      select.value = this.activeTrip().id;
      return;
    }
    if (await this.store.switchTrip(select.value)) {
      this.replaceId.set("");
      this.newPoint.set("");
      this.addingPoint.set(false);
    }
    select.value = this.activeTrip().id;
  }
  async appendPoint() {
    if (this.savingPoint()) return;
    const id = this.newPoint();
    this.savingPoint.set(true);
    try {
      await this.store.addTrip(id);
      if (this.store.state().trip.some(point => point.placeId === id)) this.newPoint.set("");
    } finally { this.savingPoint.set(false); }
  }
  coordinateLabel(point: {lat: number | null; lng: number | null}) {
    return hasCoordinates(point) ? `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}` : "Chưa có tọa độ";
  }
  chooseReplacement(placeId: string) {
    this.replaceId.set(this.replaceId() === placeId ? "" : placeId);
    this.replacement.set("");
  }
  async resolve(placeId: string, decision: "update" | "keep", replacementId?: string) {
    if (this.resolving()) return;
    this.resolving.set(true);
    try {
      if (await this.store.resolveTripChange(placeId, decision, replacementId)) {
        this.replaceId.set("");
        this.replacement.set("");
        this.store.toast(replacementId ? "Đã thay điểm ghé." : decision === "keep" ? "Đã giữ kế hoạch cũ." : "Đã cập nhật điểm ghé.");
      }
    } finally { this.resolving.set(false); }
  }
  editInfo(field: keyof TripInfo, value: string) {
    this.pendingInfo.set({ ...this.tripInfo(), [field]: value });
  }
  canLeave() {
    if (!this.pendingInfo() && !this.coverReading()) return true;
    this.store.toast("Lưu hoặc bỏ thay đổi thông tin chuyến đi trước khi rời trang.");
    return false;
  }
  async saveInfo() {
    const info = this.pendingInfo();
    if (!info || this.savingInfo() || this.coverReading()) return;
    const { name, note, cover, date, endDate } = info;
    this.savingInfo.set(true);
    try {
      const saved = await this.store.update(state => {
        const end = endDate || date;
        if ((date && !validTripDate(date)) || (endDate && (!date || !validTripDate(endDate) || end < date)) ||
            state.trip.some(point => point.date && (!date || point.date < date || point.date > end))) {
          this.store.toast("Khoảng ngày phải hợp lệ và bao gồm mọi điểm đã chọn ngày ghé.");
          return null;
        }
        if (cover && !validTripCover(cover)) {
          this.store.toast("Chọn ảnh bìa JPG, PNG hoặc WebP tối đa 1 MB.");
          return null;
        }
        return {
          ...state,
          tripName: name.trim().slice(0, 80) || "Chuyến đi của mình",
          tripNote: note.trim().slice(0, 500),
          tripCover: cover || undefined,
          tripDate: date,
          tripEndDate: endDate,
          trip: orderTripDays(state.trip, date),
        };
      });
      if (saved && this.pendingInfo() === info) {
        this.pendingInfo.set(null);
        this.store.toast("Đã lưu thông tin chuyến đi.");
      }
    } finally {
      this.savingInfo.set(false);
    }
  }
  async savePointDate(placeId: string, event: Event) {
    const input = event.target as HTMLInputElement;
    const value = input.value;
    await this.store.update(state => {
      if (!validTripDate(value) || value < state.tripDate || value > (state.tripEndDate || state.tripDate)) {
        this.store.toast("Chọn ngày ghé trong khoảng ngày của chuyến đi.");
        return null;
      }
      const trip = state.trip.map(point => point.placeId === placeId ? { ...point, date: value === state.tripDate ? undefined : value } : point);
      return { ...state, trip: orderTripDays(trip, state.tripDate) };
    });
    const point = this.store.state().trip.find(item => item.placeId === placeId);
    if (point) input.value = this.day(point);
  }
  async saveBudget(event: Event) {
    const input = event.target as HTMLInputElement;
    const budget = input.value ? input.valueAsNumber : null;
    if (input.validity.badInput || (budget !== null && !validTripBudget(budget))) {
      this.store.toast("Nhập ngân sách bằng số nguyên không âm.");
    } else {
      await this.store.update(state => ({ ...state, tripBudget: budget }));
    }
    input.value = String(this.store.state().tripBudget ?? "");
  }
  async saveEstimatedCost(placeId: string, event: Event) {
    const input = event.target as HTMLInputElement;
    const entered = input.value;
    const estimate = entered ? input.valueAsNumber : undefined;
    if (input.validity.badInput || (estimate !== undefined && !validTripBudget(estimate))) {
      this.store.toast("Nhập chi phí dự kiến bằng số nguyên không âm.");
    } else {
      await this.store.update(state => ({
        ...state,
        trip: state.trip.map(point => point.placeId === placeId ? { ...point, estimatedCost: estimate } : point),
      }));
    }
    if (input.value === entered) input.value = String(this.store.state().trip.find(point => point.placeId === placeId)?.estimatedCost ?? "");
  }
  async saveNote(event: Event, placeId: string) {
    const input = event.target as HTMLInputElement;
    const entered = input.value;
    const note = entered.trim().slice(0, 180);
    await this.store.update(state => ({ ...state, trip: state.trip.map(point => point.placeId === placeId ? { ...point, note } : point) }));
    const state = this.store.state();
    if (input.value === entered) input.value = state.trip.find(point => point.placeId === placeId)?.note ?? "";
  }
  async changeTime(placeId: string, event: Event) {
    const input = event.target as HTMLInputElement;
    const value = input.value;
    if (!validTripTime(value)) {
      this.store.toast("Giờ ghé không hợp lệ. Đã giữ giờ đã lưu.");
    } else {
      await this.store.update((s) => ({
        ...s,
        trip: setTripTime(s.trip, placeId, value),
      }));
    }
    if (input.value === value) input.value = this.store.state().trip.find(point => point.placeId === placeId)?.time ?? "";
  }
  async move(placeId: string, neighborId: string | null) {
    if (neighborId === null) return;
    await this.store.update((s) => ({
      ...s,
      trip: swapTripPoints(s.trip, placeId, neighborId),
    }));
  }
  async remove(id: string) {
    if (
      await this.store.update((s) => ({
        ...s,
        trip: removeTripPoint(s.trip, id),
      }))
    )
      this.store.toast("Đã bỏ điểm ghé và tính lại chi phí.");
  }
}
