import { Injectable, computed, effect, inject, signal } from "@angular/core";
import { TravelStore } from "./store";
import type { Place } from "./data";
import { ModerationClient, ModerationError, type ModerationSession, type ServerReview, type ServerWorkflowRequest } from "./moderation-api";
import { placeRevision, type DemoActor, type ReportAction, type WorkflowDecision, type WorkflowDraft } from "./workflow";

@Injectable({ providedIn: "root" })
export class WorkflowStore {
  private readonly store = inject(TravelStore);
  private readonly api = new ModerationClient();
  private readonly session = signal<ModerationSession | null>(null);
  private readonly serverPlaces = signal<Place[]>([]);
  private readonly serverReviews = signal<ServerReview[]>([]);
  private readonly grants = signal<string[]>([]);
  private generation = 0;
  private adminQueue = false;
  private readonly boundaryTick = signal(0);
  readonly requests = signal<ServerWorkflowRequest[]>([]);
  readonly entries = this.requests;
  readonly loading = signal(false);
  readonly error = signal("");
  readonly places = computed(() => {
    const places = new Map(this.store.places().map(place => [place.id, place]));
    for (const place of this.serverPlaces()) places.set(place.id, place);
    return [...places.values()];
  });

  constructor() {
    effect(onCleanup => {
      this.boundaryTick();
      const now = Date.now();
      const upcoming = this.requests().filter(item => item.kind === "update" && item.status === "approved")
        .flatMap(item => [item.effectiveFrom, item.effectiveUntil].filter((value): value is string => !!value)
          .map(value => ({at: Date.parse(value), placeId: item.placeId}))).filter(item => item.at > now).sort((a, b) => a.at - b.at);
      if (!upcoming.length) return;
      const generation = this.generation;
      const next = upcoming[0].at;
      const timer = setTimeout(() => {
        if (generation !== this.generation) return;
        for (const id of new Set(upcoming.filter(item => item.at === next).map(item => item.placeId))) void this.loadPlace(id);
        this.boundaryTick.update(tick => tick + 1);
      }, Math.min(2_147_483_647, Math.max(1, next - now + 10)));
      onCleanup(() => clearTimeout(timer));
    });
  }

  async authorize(admin = false): Promise<boolean> {
    const generation = ++this.generation;
    this.clear();
    this.adminQueue = admin;
    this.loading.set(true);
    try {
      const session = await this.api.session();
      if (generation !== this.generation) return false;
      if (admin && !session.admin) throw new ModerationError("Tài khoản không có quyền Quản trị viên.", 403);
      this.session.set(session);
      return await this.refresh(generation);
    } catch (error) {
      if (generation === this.generation) this.fail(error);
      return false;
    } finally {
      if (generation === this.generation) this.loading.set(false);
    }
  }

  canManage(placeId: string) { return this.grants().includes(placeId); }
  revision(placeId: string) { return placeRevision(this.serverPlaces().find(place => place.id === placeId)); }
  reviewFor(placeId: string) { return this.serverReviews().find(review => review.placeId === placeId); }
  reviewPhotos(placeId: string) {
    return this.reviewFor(placeId)?.photos.map((src, index) => ({ src, index })) ?? [];
  }
  visibleReply(placeId: string) { return this.reviewFor(placeId)?.reply ?? undefined; }

  async loadPlace(placeId: string) {
    if (!placeId || !this.session()) return false;
    const generation = this.generation;
    try {
      const [place, reviews] = await Promise.all([this.api.place(placeId), this.api.reviews(placeId)]);
      if (generation !== this.generation) return false;
      this.serverPlaces.update(places => [...places.filter(item => item.id !== placeId), place]);
      this.store.mergeModeratedPlace(place);
      this.serverReviews.update(items => [...items.filter(item => item.placeId !== placeId), ...reviews]);
      return true;
    } catch (error) {
      if (generation === this.generation) this.fail(error);
      return false;
    }
  }

  submit(actor: DemoActor, draft: WorkflowDraft) {
    return this.write("contributions", "POST", this.draft(actor, draft));
  }
  resubmit(actor: DemoActor, id: string, draft: WorkflowDraft) {
    const request = this.requests().find(item => item.id === id);
    return this.write(`contributions/${id}`, "PUT", { ...this.draft(actor, draft), expectedVersion: request?.version });
  }
  withdraw(_actor: DemoActor, id: string) {
    const request = this.requests().find(item => item.id === id);
    return this.write(`contributions/${id}/withdraw`, "POST", { expectedVersion: request?.version });
  }
  decide(id: string, decision: WorkflowDecision, reason: string, reportAction?: ReportAction) {
    const request = this.requests().find(item => item.id === id);
    return this.write(`moderation/${id}/decision`, "POST", { decision, reason, reportAction, expectedVersion: request?.version });
  }
  reply(placeId: string, text: string, reviewVersion?: string) {
    const review = this.reviewFor(placeId);
    if (!review || review.updatedAt !== reviewVersion) {
      this.store.toast("Đánh giá đã đổi. Hãy mở lại phiên bản hiện hành.");
      return Promise.resolve(false);
    }
    return this.write(`owner/reviews/${review.id}/reply`, "PUT", { text, reviewVersion }, placeId);
  }

  private draft(actor: DemoActor, draft: WorkflowDraft) {
    const review = this.reviewFor(draft.placeId ?? "");
    return { ...draft, context: actor === "owner" ? "owner" : "user",
      reviewId: draft.kind === "report" ? review?.id : undefined,
      photoId: draft.photoIndex === undefined ? undefined : review?.photoIds[draft.photoIndex] };
  }

  private async write(path: string, method: string, body: unknown, placeId?: string): Promise<boolean> {
    const generation = this.generation;
    const account = this.session()?.id;
    let committed = false;
    try {
      const current = await this.api.session();
      if (generation !== this.generation) return false;
      if (!account || current.id !== account) {
        ++this.generation;
        this.clear();
        throw new ModerationError("Phiên tài khoản đã đổi. Mở lại màn hình trước khi gửi.", 401);
      }
      const result = await this.api.request<{ data: ServerWorkflowRequest | null }>(path, method, body);
      committed = true;
      if (generation !== this.generation) return true;
      if (result.data) this.requests.update(items => [result.data!, ...items.filter(item => item.id !== result.data!.id)]);
      const target = placeId ?? result.data?.placeId;
      const loaded = target && (placeId || result.data?.status === "approved") ? await this.loadPlace(target) : true;
      await this.refresh(generation);
      if (generation === this.generation) this.store.toast(loaded ? "Đã lưu thay đổi trên máy chủ." : "Đã lưu trên máy chủ; chưa tải lại được hồ sơ. Hãy mở lại màn hình để xem kết quả.");
      return true;
    } catch (error) {
      if (generation === this.generation && error instanceof ModerationError && (error.status === 403 || error.status === 409)) {
        await this.refresh(generation).catch(() => false);
      }
      if (generation === this.generation || !this.session()) this.fail(error);
      // A failed reload must not invite repeating an already committed decision.
      return committed;
    }
  }

  private async refresh(generation: number): Promise<boolean> {
    const [requests, grants] = await Promise.all([
      this.api.requests(this.adminQueue),
      this.api.request<{ data: { placeId: string }[] }>("owner/grants"),
    ]);
    if (generation !== this.generation) return false;
    this.requests.set(requests);
    this.grants.set(grants.data.map(item => item.placeId));
    for (const grant of grants.data) await this.loadPlace(grant.placeId);
    return generation === this.generation;
  }

  private clear() {
    this.session.set(null);
    this.requests.set([]);
    this.grants.set([]);
    this.serverPlaces.set([]);
    this.serverReviews.set([]);
    this.error.set("");
  }

  private fail(error: unknown) {
    if (error instanceof ModerationError && (error.status === 401 || error.status === 419)) {
      ++this.generation;
      this.clear();
    }
    const message = error instanceof Error ? error.message : "Chưa xử lý được yêu cầu. Hãy thử lại.";
    this.error.set(message);
    this.store.toast(message);
  }
}
