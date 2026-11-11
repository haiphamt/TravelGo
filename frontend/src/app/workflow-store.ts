import { Injectable, computed, inject } from "@angular/core";
import { TravelStore } from "./store";
import {
  EMPTY_WORKFLOW, decideRequest, managesPlace, placeRevision, saveReply, submitRequest, withdrawRequest,
} from "./workflow";
import type { DemoActor, ReportAction, WorkflowDecision, WorkflowDraft, WorkflowState } from "./workflow";
import type { DemoState } from "./logic";

@Injectable({ providedIn: "root" })
export class WorkflowStore {
  private readonly store = inject(TravelStore);
  readonly requests = computed(() => this.store.workflow().requests);
  readonly entries = this.requests;

  canManage(placeId: string) {
    return managesPlace(this.store.workflow(), placeId);
  }
  revision(placeId: string) {
    return placeRevision(this.store.places().find(place => place.id === placeId));
  }
  visibleReply(placeId: string) {
    const review = this.store.visibleReviewFor(placeId);
    if (!review) return undefined;
    return this.store.workflow().replies.find(reply => reply.placeId === placeId && reply.reviewVersion === review.updatedAt);
  }
  submit(actor: DemoActor, draft: WorkflowDraft) {
    return this.apply((state, demo, now) =>
      submitRequest(state, { places: this.store.catalogAt(now), reviews: demo.reviews, now }, actor, draft, crypto.randomUUID()));
  }
  resubmit(actor: DemoActor, id: string, draft: WorkflowDraft) {
    return this.apply((state, demo, now) =>
      submitRequest(state, { places: this.store.catalogAt(now), reviews: demo.reviews, now }, actor, draft, id, id));
  }
  withdraw(actor: DemoActor, id: string) {
    return this.apply((state, _, now) => withdrawRequest(state, actor, id, now));
  }
  decide(id: string, decision: WorkflowDecision, reason: string, reportAction?: ReportAction) {
    return this.apply((state, demo, now) =>
      decideRequest(state, { places: this.store.catalogAt(now), reviews: demo.reviews, now }, id, decision, reason, reportAction));
  }
  reply(placeId: string, text: string, reviewVersion?: string) {
    return this.apply((state, demo, now) => {
      const review = demo.reviews.find(item => item.placeId === placeId);
      if (reviewVersion !== undefined && review?.updatedAt !== reviewVersion) return "Đánh giá đã đổi. Hãy mở lại phiên bản hiện hành.";
      return saveReply(state, review, placeId, text, now);
    });
  }
  private async apply(change: (state: WorkflowState, demo: DemoState, now: string) => WorkflowState | string) {
    if (this.store.catalogStatus() !== "ready") {
      this.store.toast("Chờ danh mục tải xong rồi thử lại.");
      return false;
    }
    const saved = await this.store.update(demo => {
      const next = change(demo.workflow ?? EMPTY_WORKFLOW, demo, new Date().toISOString());
      if (typeof next === "string") {
        this.store.toast(next);
        return null;
      }
      return { ...demo, workflow: next };
    });
    if (saved) this.store.toast("Đã lưu thay đổi trong bản dùng thử.");
    return saved;
  }
}
