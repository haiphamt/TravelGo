import { Injectable, computed, effect, signal } from "@angular/core";
import { City, Place } from "./data";
import { ApiError, PlacesApi, type ApiReview } from "./places-api";
import {
  DemoState,
  EMPTY_STATE,
  Review,
  type TripDraft,
  type TripItem,
  appendTripPoint,
  normalize,
  orderTripDays,
  validateReview,
  validateTripDraft,
} from "./logic";
import { activateTrip, currentTrip, hasActiveTrip, restoreTripFields } from "./trip-storage";
import { ItineraryApi, ItineraryApiError, type SuggestionRequest } from "./itinerary-api";
import { restoreRoomState } from "./room-state";
import {
  EMPTY_WORKFLOW,
  nextWorkflowBoundary,
  resolveTripSelection,
  restoreWorkflow,
  tripNeedsReview,
  tripSnapshot,
  validTripSnapshot,
} from "./workflow";

@Injectable({ providedIn: "root" })
export class TravelStore {
  private itineraryApi: ItineraryApi | undefined;
  readonly itineraryStorage = signal<"demo" | "api">("demo");
  readonly itineraryError = signal("");
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
  readonly favoriteIds = signal<string[]>([]);
  readonly accountStatus = signal<"loading" | "ready" | "guest" | "error">("loading");
  readonly accountError = signal("");
  readonly favoritePending = signal(false);
  private readonly api = new PlacesApi();
  private accountEpoch = 0;
  readonly accountGeneration = signal(0);
  private readonly ownReviews = signal<Record<string, ApiReview | null>>({});
  readonly ownReviewStatus = signal<Record<string, "loading" | "ready" | "guest" | "error">>({});
  readonly publicReviews = signal<Record<string, ApiReview[]>>({});
  readonly reviewStatus = signal<Record<string, "loading" | "ready" | "error">>({});
  readonly reviewErrors = signal<Record<string, string>>({});
  readonly reviewPages = signal<Record<string, { page: number; lastPage: number }>>({});
  readonly detailStatus = signal<Record<string, "loading" | "ready" | "missing" | "error">>({});
  readonly detailErrors = signal<Record<string, string>>({});
  private readonly detailPlaces = signal<Record<string, Place>>({});
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
    void this.refreshAccount();
  }
  async loadCatalog() {
    if (this.catalogLoading) return;
    this.catalogLoading = true;
    this.catalogStatus.set("loading");
    this.catalogError.set("");
    try {
      this.sourcePlaces.set(await this.api.catalog());
      this.catalogStatus.set("ready");
    } catch (error) {
      this.catalogError.set(error instanceof Error ? error.message : "Không tải được danh mục địa điểm.");
      this.catalogStatus.set("error");
    } finally {
      this.catalogLoading = false;
    }
  }
  catalogAt(_now: string) {
    // Demo moderation is kept in its own state; it cannot rewrite server data.
    const details = this.detailPlaces();
    return this.sourcePlaces().map(place => details[place.id] ?? place);
  }
  private catalogHas(id: string) {
    if (this.detailStatus()[id] === "ready" && this.detailPlaces()[id]) return true;
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
      const config = await fetch('/itinerary-config.json', { cache: 'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null);
      if (config?.storage === 'api') {
        this.itineraryApi = new ItineraryApi();
        this.itineraryStorage.set('api');
      }
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
          favorites: [],
          reviews: [],
          ...restoreTripFields(this.itineraryApi ? structuredClone(EMPTY_STATE) : candidate),
          roomState: restoreRoomState(candidate.roomState),
          workflow: restoreWorkflow(candidate.workflow),
        });
      }
    } catch {
      this.storageWarning.set(
        "Trình duyệt chưa cho phép lưu bản dùng thử. Hãy bật lưu trữ của trang rồi tải lại.",
      );
    } finally {
      if (this.itineraryApi) {
        try {
          const trips = await this.itineraryApi.list();
          let state: DemoState = { ...this.state(), ...restoreTripFields(structuredClone(EMPTY_STATE)) };
          if (trips.length) state = activateTrip(state, trips[0]);
          state.savedTrips = trips.slice(1);
          this.state.set(state);
          this.itineraryError.set("");
        } catch (error) { this.reportItineraryError(error); }
      }
      this.ready.set(true);
    }
  }
  async update(
    change: (state: DemoState) => DemoState | null,
  ): Promise<boolean> {
    let success = false;
    this.queue = this.queue.then(async () => {
      if ((!this.db && !this.itineraryApi) || !this.ready()) {
        this.toast(
          "Chưa thể lưu. Vui lòng tải lại trang khi trình duyệt cho phép lưu trữ.",
        );
        return;
      }
      try {
        const next = change(this.state());
        if (!next) return;
        if (this.itineraryApi && JSON.stringify(currentTrip(next)) !== JSON.stringify(currentTrip(this.state()))) {
          const previous = currentTrip(this.state());
          try {
            const saved = await this.itineraryApi.save(currentTrip(next), hasActiveTrip(this.state()) ? previous.id : undefined);
            this.state.set({ ...next, ...restoreTripFields({ ...next, tripId: saved.id, trip: saved.points,
              tripName: saved.name, tripDate: saved.date, tripEndDate: saved.endDate,
              tripBudget: saved.budget, tripCover: saved.cover, tripNote: saved.note, tripSource: saved.source }) });
            this.itineraryError.set(""); success = true;
          } catch (error) { this.reportItineraryError(error); }
          return;
        }
        const written = await new Promise<boolean>((resolve, reject) => {
          const tx = this.db!.transaction("state", "readwrite");
          const entries = tx.objectStore("state");
          const revision = entries.get("revision");
          let changed = false;
          revision.onsuccess = () => {
            if ((revision.result ?? 0) !== this.storageRevision) return;
            // Account itineraries stay on the server; never persist them in the shared demo cache.
            entries.put(this.itineraryApi ? { ...next, ...restoreTripFields(structuredClone(EMPTY_STATE)) } : next, "current");
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
    return this.favoriteIds().includes(id);
  }
  // The account module should call this after login/logout; no local role grants access.
  async refreshAccount() {
    const epoch = ++this.accountEpoch;
    this.accountGeneration.set(epoch);
    const reviewPlaces = Object.keys(this.ownReviewStatus());
    this.favoriteIds.set([]);
    this.ownReviews.set({});
    this.ownReviewStatus.set({});
    this.accountStatus.set("loading");
    this.accountError.set("");
    try {
      const ids = await this.api.favorites();
      if (epoch !== this.accountEpoch) return;
      this.favoriteIds.set(ids);
      this.accountStatus.set("ready");
    } catch (error) {
      if (epoch !== this.accountEpoch) return;
      this.accountStatus.set(error instanceof ApiError && error.status === 401 ? "guest" : "error");
      this.accountError.set(this.apiMessage(error));
    } finally {
      if (epoch === this.accountEpoch) await Promise.all(reviewPlaces.map(id => this.loadOwnReview(id)));
    }
  }
  private apiMessage(error: unknown) {
    return error instanceof Error ? error.message : "Chưa xử lý được. Hãy thử lại.";
  }
  private accountFailure(error: unknown) {
    if (error instanceof ApiError && error.status === 401) {
      ++this.accountEpoch;
      this.accountGeneration.set(this.accountEpoch);
      this.favoriteIds.set([]);
      this.ownReviews.set({});
      this.ownReviewStatus.update(status => Object.fromEntries(Object.keys(status).map(id => [id, "guest" as const])));
      this.accountStatus.set("guest");
    }
    this.toast(this.apiMessage(error));
  }
  private async requireAccount() {
    if (this.accountStatus() === "guest") {
      this.toast("Hãy đăng nhập để lưu yêu thích và đánh giá.");
      return false;
    }
    if (this.accountStatus() !== "ready") await this.refreshAccount();
    if (this.accountStatus() === "ready") return true;
    this.toast(this.accountError() || "Hãy đăng nhập để lưu yêu thích và đánh giá.");
    return false;
  }
  async toggleFavorite(id: string) {
    if (!this.catalogHas(id) || this.favoritePending()) return;
    if (!await this.requireAccount()) return;
    const existed = this.hasFavorite(id);
    this.favoritePending.set(true);
    const epoch = this.accountEpoch;
    try {
      const favorites = await this.api.favorites(existed ? "DELETE" : "PUT", id);
      if (epoch !== this.accountEpoch) return;
      this.favoriteIds.set(favorites);
      this.toast(existed ? "Đã bỏ khỏi yêu thích." : "Đã lưu vào yêu thích.");
    } catch (error) { if (epoch === this.accountEpoch) this.accountFailure(error); }
    finally { this.favoritePending.set(false); }
  }
  async removeFavorite(id: string) {
    if (this.favoritePending() || !await this.requireAccount()) return;
    this.favoritePending.set(true);
    const epoch = this.accountEpoch;
    try {
      const favorites = await this.api.favorites("DELETE", id);
      if (epoch !== this.accountEpoch) return;
      this.favoriteIds.set(favorites);
      this.toast("Đã bỏ khỏi yêu thích.");
    } catch (error) { if (epoch === this.accountEpoch) this.accountFailure(error); }
    finally { this.favoritePending.set(false); }
  }
  reviewFor(id: string) {
    return this.ownReviews()[id] ?? undefined;
  }
  visibleReviewFor(id: string) {
    const review = this.reviewFor(id);
    return review?.hidden ? undefined : review;
  }
  visibleReviewPhotos(id: string) {
    return this.visibleReviewFor(id)?.photos.map((src, index) => ({ src, index })) ?? [];
  }
  placeFor(id: string) {
    return this.detailPlaces()[id] ?? this.places().find(place => place.id === id);
  }
  ratingFor(id: string) {
    const place = this.placeFor(id);
    return place?.rating == null || !place.reviewCount ? undefined : { rating: place.rating, count: place.reviewCount };
  }
  async loadPlaceDetail(id: string) {
    if (!id || this.detailStatus()[id] === "loading") return;
    this.detailStatus.update(status => ({ ...status, [id]: "loading" }));
    try {
      const place = await this.api.detail(id);
      this.detailPlaces.update(places => ({ ...places, [id]: place }));
      this.detailStatus.update(status => ({ ...status, [id]: "ready" }));
    } catch (error) {
      this.detailStatus.update(status => ({ ...status, [id]: error instanceof ApiError && error.status === 404 ? "missing" : "error" }));
      this.detailErrors.update(errors => ({ ...errors, [id]: this.apiMessage(error) }));
    }
  }
  async loadOwnReview(id: string) {
    if (!id || this.ownReviewStatus()[id] === "loading") return;
    const epoch = this.accountEpoch;
    this.ownReviewStatus.update(status => ({ ...status, [id]: "loading" }));
    try {
      const review = await this.api.ownReview(id);
      if (epoch !== this.accountEpoch) return;
      this.ownReviews.update(reviews => ({ ...reviews, [id]: review }));
      this.ownReviewStatus.update(status => ({ ...status, [id]: "ready" }));
    } catch (error) {
      if (epoch !== this.accountEpoch) return;
      if (error instanceof ApiError && error.status === 401) {
        this.ownReviews.update(reviews => ({ ...reviews, [id]: null }));
        this.ownReviewStatus.update(status => ({ ...status, [id]: "guest" }));
      } else this.ownReviewStatus.update(status => ({ ...status, [id]: "error" }));
    }
  }
  async loadReviews(id: string, more = false) {
    if (!id || this.reviewStatus()[id] === "loading") return;
    const current = this.reviewPages()[id];
    if (more && current && current.page >= current.lastPage) return;
    const page = more && current ? current.page + 1 : 1;
    this.reviewStatus.update(status => ({ ...status, [id]: "loading" }));
    try {
      const result = await this.api.reviews(id, page);
      this.publicReviews.update(reviews => ({ ...reviews, [id]: more ? [...(reviews[id] ?? []), ...result.data] : result.data }));
      this.reviewPages.update(pages => ({ ...pages, [id]: { page: result.meta.current_page, lastPage: result.meta.last_page } }));
      const place = this.placeFor(id);
      if (place) this.detailPlaces.update(places => ({ ...places, [id]: { ...place, reviewCount: result.summary.count, rating: result.summary.average } }));
      this.reviewStatus.update(status => ({ ...status, [id]: "ready" }));
      this.reviewErrors.update(errors => ({ ...errors, [id]: "" }));
    } catch (error) {
      this.reviewStatus.update(status => ({ ...status, [id]: "error" }));
      this.reviewErrors.update(errors => ({ ...errors, [id]: this.apiMessage(error) }));
    }
  }
  async saveReview(review: Review) {
    if (!this.catalogHas(review.placeId)) return false;
    const error = validateReview(review);
    if (error) {
      this.toast(error);
      return false;
    }
    if (!await this.requireAccount()) return false;
    const epoch = this.accountEpoch;
    try {
      const saved = await this.api.saveReview(review);
      if (epoch !== this.accountEpoch) return false;
      this.ownReviews.update(reviews => ({ ...reviews, [review.placeId]: saved }));
      this.ownReviewStatus.update(status => ({ ...status, [review.placeId]: "ready" }));
      await Promise.all([this.loadPlaceDetail(review.placeId), this.loadReviews(review.placeId)]);
      return true;
    } catch (error) { if (epoch === this.accountEpoch) this.accountFailure(error); return false; }
  }
  async deleteReview(id: string) {
    const review = this.reviewFor(id);
    if (!review || !await this.requireAccount()) return false;
    const epoch = this.accountEpoch;
    try {
      await this.api.deleteReview(review.id);
      if (epoch !== this.accountEpoch) return false;
      this.ownReviews.update(reviews => ({ ...reviews, [id]: null }));
      await Promise.all([this.loadPlaceDetail(id), this.loadReviews(id)]);
      return true;
    } catch (error) { if (epoch === this.accountEpoch) this.accountFailure(error); return false; }
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
    if (this.itineraryApi) {
      try {
        if (!this.ready()) return false;
        const saved = await this.itineraryApi.save(draft);
        this.state.update(state => activateTrip(state, saved));
        this.itineraryError.set("");
        return true;
      } catch (error) { this.reportItineraryError(error); return false; }
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
  async copyRoomItinerary(roomCode: string, roomRevision: number, memberId: string): Promise<boolean> {
    if (!this.itineraryApi || !this.ready()) {
      this.toast("Chưa kết nối được dịch vụ lịch trình. Vui lòng thử lại sau.");
      return false;
    }
    try {
      const saved = await this.itineraryApi.copyRoom(roomCode, roomRevision, memberId);
      this.state.update(state => activateTrip(state, saved));
      this.itineraryError.set("");
      return true;
    } catch (error) { this.reportItineraryError(error); return false; }
  }
  async switchTrip(id: string): Promise<boolean> {
    if (this.itineraryApi) {
      try {
        const trip = await this.itineraryApi.show(id);
        this.state.update(state => activateTrip(state, trip));
        this.itineraryError.set(""); return true;
      } catch (error) { this.reportItineraryError(error); return false; }
    }
    return this.update(state => {
      const selected = state.savedTrips?.find(trip => trip.id === id);
      return selected ? activateTrip(state, selected) : null;
    });
  }
  async resolveTripChange(placeId: string, decision: "update" | "keep", replacementId?: string): Promise<boolean> {
    if (this.itineraryApi) {
      this.toast("Chưa thể xác nhận thay đổi lúc này. Kế hoạch đã lưu vẫn được giữ.");
      return false;
    }
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
  async suggestItinerary(input: SuggestionRequest) {
    if (!this.itineraryApi) return null;
    try {
      const result = await this.itineraryApi.suggest(input);
      const previousError = this.itineraryError();
      this.itineraryError.set("");
      if (previousError && this.notice() === previousError) this.notice.set("");
      return result;
    }
    catch (error) { this.reportItineraryError(error); throw error; }
  }
  private reportItineraryError(error: unknown) {
    const message = error instanceof Error ? error.message : "Chưa kết nối được lịch trình. Bản nháp vẫn được giữ.";
    this.itineraryError.set(message);
    if (error instanceof ItineraryApiError && error.status === 401) {
      this.state.update(state => ({ ...state, ...restoreTripFields(structuredClone(EMPTY_STATE)) }));
    }
    this.toast(message);
  }
}
