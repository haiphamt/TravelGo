import { Injectable, computed, effect, signal } from "@angular/core";
import { City, Place, withOsmFacets } from "./data";
import { parseCatalog } from "./catalog";
import {
  DemoState,
  EMPTY_STATE,
  Review,
  type TripDraft,
  type TripItem,
  appendTripPoint,
  normalize,
  orderTripDays,
  upsertReview,
  validateReview,
  validateTripDraft,
} from "./logic";
import { activateTrip, restoreTripFields, validPlaceId } from "./trip-storage";
import { restoreRoomState } from "./room-state";
import {
  EMPTY_WORKFLOW,
  nextWorkflowBoundary,
  projectCatalog,
  resolveTripSelection,
  restoreWorkflow,
  tripNeedsReview,
  tripSnapshot,
  validTripSnapshot,
  visibleReview,
  visibleReviewPhotos,
} from "./workflow";

@Injectable({ providedIn: "root" })
export class TravelStore {
  readonly city = signal<City>("hcm");
  private readonly sourcePlaces = signal<Place[]>([]);
  private readonly clock = signal(Date.now());
  readonly catalogStatus = signal<"loading" | "ready" | "error">("loading");
  readonly catalogError = signal("");
  private catalogLoading = false;
  readonly query = signal("");
  readonly state = signal<DemoState>(structuredClone(EMPTY_STATE));
  readonly workflow = computed(() => this.state().workflow ?? EMPTY_WORKFLOW);
  readonly places = computed(() => this.catalogAt(new Date(Math.max(this.clock(), Date.now())).toISOString()));
  readonly catalogTotal = computed(() => this.places().length);
  readonly notice = signal("");
  readonly storageWarning = signal("");
  readonly ready = signal(false);
  readonly tripPlaces = computed(() => this.state().trip.flatMap(item => {
    const currentPlace = this.places().find(place => place.id === item.placeId);
    if (!currentPlace) return [];
    const source = this.sourcePlaces().find(place => place.id === item.placeId);
    const baseline = source ?? currentPlace;
    const snapshot = item.snapshot
      ? { ...item.snapshot, price: item.snapshot.price === undefined ? baseline.price : item.snapshot.price }
      : tripSnapshot(baseline);
    const { status: plannedStatus, ...saved } = snapshot;
    return [{
      ...item, snapshot, currentPlace, plannedStatus,
      place: { ...currentPlace, ...saved },
      changed: tripNeedsReview(snapshot, currentPlace, item.keptRevision),
      change: currentPlace.demoChange,
    }];
  }));
  private db: IDBDatabase | undefined;
  private storageRevision = 0;
  private noticeTimer: ReturnType<typeof setTimeout> | undefined;
  private queue: Promise<void> = Promise.resolve();
  constructor() {
    effect(onCleanup => {
      this.clock();
      const now = new Date().toISOString();
      const boundary = nextWorkflowBoundary(this.workflow(), now);
      if (!boundary) return;
      const timer = setTimeout(() => this.clock.set(Date.now()),
        Math.min(2_147_483_647, Math.max(0, Date.parse(boundary) - Date.now())));
      onCleanup(() => clearTimeout(timer));
    });
    void this.loadCatalog();
    void this.load();
  }
  async loadCatalog() {
    if (this.catalogLoading) return;
    this.catalogLoading = true;
    this.catalogStatus.set("loading");
    this.catalogError.set("");
    try {
      const facets = fetch("/data/osm-facets.json", { credentials: "same-origin" })
        .then((response) => response.ok ? response.json() : null)
        .catch(() => null);
      const response = await fetch("/data/catalog.json", { credentials: "same-origin" });
      if (!response.ok) throw new Error(`Không tải được danh mục (HTTP ${response.status}).`);
      const places = parseCatalog(await response.json());
      this.sourcePlaces.set(withOsmFacets(places, await facets));
      this.catalogStatus.set("ready");
    } catch (error) {
      this.catalogError.set(error instanceof Error ? error.message : "Không tải được danh mục địa điểm.");
      this.catalogStatus.set("error");
    } finally {
      this.catalogLoading = false;
    }
  }
  catalogAt(now: string) {
    return projectCatalog(this.sourcePlaces(), this.workflow(), now);
  }
  private catalogHas(id: string) {
    if (this.catalogStatus() !== "ready") {
      this.toast("Danh mục chưa tải xong. Hãy thử lại sau khi danh sách xuất hiện.");
      return false;
    }
    if (!this.places().some((place) => place.id === id)) {
      this.toast("Địa điểm không có trong danh mục hiện tại.");
      return false;
    }
    return true;
  }
  private async load() {
    try {
      this.db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open("travelgo-hcm-reference-v1", 1);
        request.onupgradeneeded = () =>
          request.result.createObjectStore("state");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error("blocked"));
      });
      const raw = await new Promise<unknown>((resolve, reject) => {
        const tx = this.db!.transaction("state");
        const entries = tx.objectStore("state");
        const revision = entries.get("revision");
        const current = entries.get("current");
        tx.oncomplete = () => {
          this.storageRevision = revision.result ?? 0;
          resolve(current.result);
        };
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
      if (raw && typeof raw === "object") {
        const candidate = raw as DemoState;
        // Persisted references are not pruned against a catalog that may still be loading.
        // This namespace does not import reviews from the old invented-place prototype.
        this.state.set({
          favorites: Array.isArray(candidate.favorites)
            ? [...new Set(candidate.favorites.filter(validPlaceId))]
            : [],
          reviews: Array.isArray(candidate.reviews)
            ? candidate.reviews.filter(
                (r) =>
                  r &&
                  validPlaceId(r.placeId) &&
                  typeof r.text === "string" &&
                  typeof r.visitedOn === "string" &&
                  typeof r.updatedAt === "string" &&
                  Number.isFinite(Date.parse(r.updatedAt)) &&
                  Array.isArray(r.photos) &&
                  r.photos.every(
                    (p) =>
                      typeof p === "string" &&
                      /^data:image\/(jpeg|png|webp);base64,/.test(p),
                  ) &&
                  !validateReview(r),
              )
            : [],
          ...restoreTripFields(candidate),
          roomState: restoreRoomState(candidate.roomState),
          workflow: restoreWorkflow(candidate.workflow),
        });
      }
    } catch {
      this.storageWarning.set(
        "Trình duyệt chưa cho phép lưu bản dùng thử. Hãy bật lưu trữ của trang rồi tải lại.",
      );
    } finally {
      this.ready.set(true);
    }
  }
  async update(
    change: (state: DemoState) => DemoState | null,
  ): Promise<boolean> {
    let success = false;
    this.queue = this.queue.then(async () => {
      if (!this.db || !this.ready()) {
        this.toast(
          "Chưa thể lưu. Vui lòng tải lại trang khi trình duyệt cho phép lưu trữ.",
        );
        return;
      }
      try {
        const next = change(this.state());
        if (!next) return;
        const written = await new Promise<boolean>((resolve, reject) => {
          const tx = this.db!.transaction("state", "readwrite");
          const entries = tx.objectStore("state");
          const revision = entries.get("revision");
          let changed = false;
          revision.onsuccess = () => {
            if ((revision.result ?? 0) !== this.storageRevision) return;
            entries.put(next, "current");
            entries.put(this.storageRevision + 1, "revision");
            changed = true;
          };
          tx.oncomplete = () => resolve(changed);
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error);
        });
        if (!written) {
          this.toast("Một thẻ TravelGo khác vừa lưu thay đổi. Tải lại trang trước khi thử lưu tiếp.");
          return;
        }
        this.storageRevision += 1;
        this.state.set(next);
        success = true;
      } catch {
        this.toast(
          "Chưa lưu được. Hãy kiểm tra bộ nhớ trình duyệt rồi thử lại.",
        );
      }
    });
    await this.queue;
    return success;
  }
  toast(message: string) {
    clearTimeout(this.noticeTimer);
    this.notice.set(message);
    this.noticeTimer = setTimeout(() => this.notice.set(""), 5500);
  }
  hasFavorite(id: string) {
    return this.state().favorites.includes(id);
  }
  async toggleFavorite(id: string) {
    if (!this.catalogHas(id)) return;
    const existed = this.hasFavorite(id);
    if (
      await this.update((s) => ({
        ...s,
        favorites: s.favorites.includes(id)
          ? s.favorites.filter((x) => x !== id)
          : [...s.favorites, id],
      }))
    )
      this.toast(existed ? "Đã bỏ khỏi yêu thích." : "Đã lưu vào yêu thích.");
  }
  async removeFavorite(id: string) {
    if (await this.update(state => state.favorites.includes(id)
      ? { ...state, favorites: state.favorites.filter(saved => saved !== id) }
      : null)) {
      this.toast("Đã bỏ khỏi yêu thích.");
    }
  }
  reviewFor(id: string) {
    return this.state().reviews.find((r) => r.placeId === id);
  }
  visibleReviewFor(id: string) {
    return visibleReview(this.workflow(), this.reviewFor(id));
  }
  visibleReviewPhotos(id: string) {
    return visibleReviewPhotos(this.workflow(), this.reviewFor(id));
  }
  async saveReview(review: Review) {
    if (!this.catalogHas(review.placeId)) return false;
    const error = validateReview(review);
    if (error) {
      this.toast(error);
      return false;
    }
    return this.update((s) => {
      const lastVersions = [
        s.reviews.find(item => item.placeId === review.placeId)?.updatedAt,
        ...(s.workflow?.requests.filter(item => item.placeId === review.placeId).map(item => item.reviewVersion) ?? []),
        ...(s.workflow?.replies.filter(item => item.placeId === review.placeId).map(item => item.reviewVersion) ?? []),
      ].flatMap(version => version && Number.isFinite(Date.parse(version)) ? [Date.parse(version) + 1] : []);
      const updatedAt = new Date(Math.max(Date.now(), ...lastVersions)).toISOString();
      return { ...s, reviews: upsertReview(s.reviews, { ...review, updatedAt }) };
    });
  }
  async deleteReview(id: string) {
    return this.update((s) => ({
      ...s,
      reviews: s.reviews.filter((r) => r.placeId !== id),
    }));
  }
  async addTrip(id: string) {
    if (!this.catalogHas(id)) return;
    if (
      await this.update((s) => {
        // Check inside the queue against the latest persisted state.
        const places = this.places();
        const place = places.find(item => item.id === id);
        const trip = appendTripPoint(s.trip, id, places);
        if (typeof trip === "string") {
          this.toast(trip);
          return null;
        }
        if (!place) return null;
        const points = trip.map(item => item.placeId === id ? { ...item, snapshot: tripSnapshot(place) } : item);
        return { ...s, trip: orderTripDays(points, s.tripDate) };
      })
    )
      this.toast("Đã thêm vào lịch trình của bạn.");
  }
  async createTrip(draft: TripDraft, options?: { preserveSnapshots: boolean }): Promise<boolean> {
    const error = validateTripDraft(draft);
    if (error) {
      this.toast(error);
      return false;
    }
    return this.update(state => {
      if (this.catalogStatus() !== "ready") {
        this.toast("Chưa tải được danh mục. Vui lòng thử lại.");
        return null;
      }
      const points: TripItem[] = [];
      const catalog = this.places();
      for (const point of orderTripDays(draft.points, draft.date)) {
        const place = catalog.find(candidate => candidate.id === point.placeId && candidate.city === "hcm");
        if (!place) {
          this.toast("Một điểm ghé không còn trong danh mục. Hãy chọn lại trước khi lưu.");
          return null;
        }
        const saved = options?.preserveSnapshots && validTripSnapshot(point.snapshot);
        points.push({
          placeId: place.id,
          time: point.time,
          date: point.date === draft.date ? undefined : point.date,
          note: point.note?.trim(),
          estimatedCost: point.estimatedCost,
          snapshot: saved ? point.snapshot : tripSnapshot(place),
          keptRevision: saved ? point.keptRevision : undefined,
        });
      }
      return activateTrip(state, {
        ...draft,
        id: crypto.randomUUID(),
        name: draft.name.trim(),
        note: draft.note?.trim(),
        points,
      });
    });
  }
  async switchTrip(id: string): Promise<boolean> {
    return this.update(state => {
      const selected = state.savedTrips?.find(trip => trip.id === id);
      return selected ? activateTrip(state, selected) : null;
    });
  }
  async resolveTripChange(placeId: string, decision: "update" | "keep", replacementId?: string): Promise<boolean> {
    return this.update(state => {
      const item = this.tripPlaces().find(entry => entry.placeId === placeId);
      if (!item) return null;
      const replacement = replacementId ? this.places().find(place => place.id === replacementId) : undefined;
      const trip = replacementId && !replacement
        ? "Không tìm thấy điểm thay thế."
        : resolveTripSelection(state.trip, item, decision, replacement);
      if (typeof trip === "string") {
        this.toast(trip);
        return null;
      }
      return { ...state, trip };
    });
  }
  matches(name: string, area: string) {
    return normalize(`${name} ${area}`).includes(normalize(this.query()));
  }
}
