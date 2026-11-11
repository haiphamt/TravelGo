import assert from "node:assert/strict";
import test from "node:test";
import type { Place } from "../src/app/data.ts";
import type { Review, TripItem } from "../src/app/logic.ts";
import {
  EMPTY_WORKFLOW, decideRequest, managesPlace, nextWorkflowBoundary, placeRevision,
  projectCatalog, resolveTripSelection, restoreWorkflow, saveReply, submitRequest, tripNeedsReview, tripSnapshot, visibleReview,
  visibleReviewPhotos, withdrawRequest,
} from "../src/app/workflow.ts";
import type { WorkflowState } from "../src/app/workflow.ts";

const source: Place = {
  id: "osm:node/1", name: "Địa điểm kiểm thử", city: "hcm", category: "food", local: false,
  area: "Địa chỉ kiểm thử", sourceDistrict: "Quận 1", price: null, hours: "07:00–18:00", image: null, images: [],
  products: [], description: "", lat: 10.8, lng: 106.7, updated: null,
  sourceUrl: "https://www.openstreetmap.org/node/1", sourceLabel: "OpenStreetMap",
  sourceLicense: "ODbL", sourceUpdatedAt: null, referenceOnly: true, photoCredit: null,
};
const start = "2026-11-09T01:00:00.000Z";
const later = "2026-11-09T01:01:00.000Z";
const review: Review = {
  placeId: source.id, rating: 4, text: "Nội dung kiểm thử", photos: ["ảnh 1", "ảnh 2"],
  visitedOn: "", updatedAt: start,
};
const context = (places = [source], now = start, reviews = [review]) => ({ places, now, reviews });
function saved(value: WorkflowState | string): WorkflowState {
  assert.notEqual(typeof value, "string", typeof value === "string" ? value : undefined);
  return value as WorkflowState;
}

test("only the author can supplement or withdraw; an approved contribution uses its reserved place ID", () => {
  const id = "3fc173a1-c460-4db4-ac0c-5e653d5b3882";
  const draft = {
    kind: "new", reason: "Góp địa điểm kiểm thử", hcmConfirmed: true,
    patch: { name: "Địa điểm mới", area: "Địa chỉ mới", category: "food" },
  } as const;
  const pending = saved(submitRequest(EMPTY_WORKFLOW, context(), "user", draft, id));
  assert.equal(pending.requests[0].placeId, `tg-demo-${id}`);
  assert.deepEqual(projectCatalog([source], pending, start), [source]);
  const supplement = saved(decideRequest(pending, context(), id, "needs-info", "Bổ sung địa chỉ"));
  assert.equal(typeof submitRequest(supplement, context(), "owner", draft, id, id), "string");
  assert.equal(typeof withdrawRequest(supplement, "owner", id, start), "string");
  const resubmitted = saved(submitRequest(supplement, context([], later), "user",
    { ...draft, reason: "Đã bổ sung địa chỉ", patch: { ...draft.patch, area: "Địa chỉ bổ sung" } }, id, id));
  const approved = saved(decideRequest(resubmitted, context([source], later), id, "approved", "Đã đối chiếu trong bản thử"));
  const visible = projectCatalog([source], approved, later);
  assert.deepEqual(visible.map(place => place.id), [source.id, `tg-demo-${id}`]);
  assert.equal(visible[1].area, "Địa chỉ bổ sung");
  assert.equal(visible[1].referenceOnly, true);
  assert.equal(visible[1].sourceUpdatedAt, null);
  assert.deepEqual(approved.requests[0].history.map(event => event.status), ["pending", "needs-info", "pending", "approved"]);
  assert.equal(typeof withdrawRequest(approved, "user", id, later), "string");
});

test("a grant requires consent, evidence and approval and covers only the claimed place", () => {
  const claim = {
    kind: "claim", placeId: source.id, reason: "Yêu cầu quản lý", relationship: "representative",
    evidence: "Nội dung đối chiếu riêng trong bản thử", agreement: true,
  } as const;
  const change = {
    kind: "update", placeId: source.id, reason: "Đề xuất giờ", change: "hours", patch: { hours: "09:00–18:00" },
  } as const;
  assert.equal(typeof submitRequest(EMPTY_WORKFLOW, context(), "user", claim, "claim"), "string");
  assert.equal(typeof submitRequest(EMPTY_WORKFLOW, context(), "owner", { ...claim, agreement: false }, "claim"), "string");
  assert.equal(typeof submitRequest(EMPTY_WORKFLOW, context(), "owner", change, "update"), "string");
  const pending = saved(submitRequest(EMPTY_WORKFLOW, context(), "owner", claim, "claim"));
  assert.equal(managesPlace(pending, source.id), false);
  const approved = saved(decideRequest(pending, context(), "claim", "approved", "Cấp quyền thử"));
  assert.equal(managesPlace(approved, source.id), true);
  assert.equal(managesPlace(approved, "osm:node/2"), false);
  assert.deepEqual(projectCatalog([source], approved, start), [source]);
  assert.equal(typeof saveReply(approved, { ...review, placeId: "osm:node/2" }, "osm:node/2", "Phản hồi", start), "string");
  assert.equal(saved(submitRequest(approved, context(), "owner", change, "update")).requests.length, 2);
});

test("revoking an approved claim suspends pending owner updates without undoing published edits", () => {
  const claim = {
    kind: "claim", placeId: source.id, reason: "Xin quyền quản lý", relationship: "owner",
    evidence: "Bằng chứng kiểm thử", agreement: true,
  } as const;
  const draft = {
    kind: "update", placeId: source.id, reason: "Đổi giờ bán", change: "hours", patch: { hours: "08:00–18:00" },
  } as const;
  let state = saved(submitRequest(EMPTY_WORKFLOW, context(), "owner", claim, "claim"));
  assert.equal(typeof decideRequest(state, context(), "claim", "revoked", "Thu hồi"), "string");
  state = saved(decideRequest(state, context(), "claim", "approved", "Cấp quyền thử"));
  state = saved(submitRequest(state, context(), "owner", draft, "published"));
  state = saved(decideRequest(state, context(), "published", "approved", "Công bố giờ bán"));
  const current = projectCatalog([source], state, later);
  const active = context(current, later);
  state = saved(submitRequest(state, active, "owner", { ...draft, patch: { hours: "09:00–18:00" } }, "pending"));
  assert.equal(typeof decideRequest(state, active, "published", "revoked", "Thu hồi"), "string");
  assert.equal(typeof decideRequest(state, active, "claim", "revoked", " "), "string");
  state = restoreWorkflow(saved(decideRequest(state, active, "claim", "revoked", "Đã hết phạm vi đại diện")));
  assert.equal(managesPlace(state, source.id), false);
  assert.deepEqual(state.requests[0].history.at(-1), {
    actor: "admin", status: "revoked", reason: "Đã hết phạm vi đại diện", at: later,
  });
  assert.equal(projectCatalog([source], state, later)[0].hours, "08:00–18:00");
  assert.equal(typeof saveReply(state, review, source.id, "Phản hồi", later), "string");
  assert.equal(typeof decideRequest(state, active, "pending", "approved", "Duyệt"), "string");
  assert.equal(typeof decideRequest(state, active, "claim", "revoked", "Lặp lại"), "string");
  state = saved(submitRequest(state, active, "owner", claim, "renewed"));
  state = saved(decideRequest(state, active, "renewed", "approved", "Cấp quyền lại"));
  assert.equal(managesPlace(state, source.id), true);
  state = saved(decideRequest(state, active, "pending", "approved", "Quyền hiện tại đã được xác nhận"));
  assert.equal(projectCatalog([source], state, later)[0].hours, "09:00–18:00");
});

test("approval checks the proposal base revision and excludes rejected or withdrawn changes", () => {
  const draft = { kind: "update", placeId: source.id, reason: "Đổi giờ", change: "hours", patch: { hours: "08:00–18:00" } } as const;
  let state = saved(submitRequest(EMPTY_WORKFLOW, context(), "user", draft, "first"));
  state = saved(submitRequest(state, context(), "user", { ...draft, patch: { hours: "09:00–18:00" } }, "second"));
  state = saved(decideRequest(state, context(), "first", "approved", "Duyệt giờ mới"));
  const current = projectCatalog([source], state, later);
  assert.equal(current[0].hours, "08:00–18:00");
  assert.equal(source.hours, "07:00–18:00");
  assert.equal(typeof decideRequest(state, context(current, later), "second", "approved", "Đã xem"), "string");
  state = saved(decideRequest(state, context(current, later), "second", "needs-info", "Đối chiếu bản mới"));
  state = saved(withdrawRequest(state, "user", "second", later));
  assert.equal(state.requests[1].status, "withdrawn");
  assert.equal(projectCatalog([source], state, later)[0].hours, "08:00–18:00");
});

test("temporary moves activate at the TP.HCM time and restore original coordinates on expiry", () => {
  const draft = {
    kind: "update", placeId: source.id, reason: "Chuyển tạm để kiểm thử", change: "temporary-move",
    patch: { lat: 10.85, lng: 106.72 }, hcmConfirmed: true,
    effectiveFrom: "2026-11-09T08:15", effectiveUntil: "2026-11-09T09:15",
  } as const;
  assert.equal(typeof submitRequest(EMPTY_WORKFLOW, context(), "user", { ...draft, hcmConfirmed: false }, "move"), "string");
  assert.equal(typeof submitRequest(EMPTY_WORKFLOW, context(), "user", { ...draft, effectiveFrom: "2026-02-31" }, "move"), "string");
  assert.equal(typeof submitRequest(EMPTY_WORKFLOW, context(), "user", { ...draft, patch: { lat: NaN, lng: 106.72 } }, "move"), "string");
  const pending = saved(submitRequest(EMPTY_WORKFLOW, context(), "user", draft, "move"));
  const state = saved(decideRequest(pending, context([source], later), "move", "approved", "Duyệt chuyển tạm"));
  const active = "2026-11-09T01:15:00.000Z";
  const expired = "2026-11-09T02:15:00.000Z";
  assert.equal(nextWorkflowBoundary(state, later), active);
  assert.equal(projectCatalog([source], state, later)[0].lat, source.lat);
  const updated = projectCatalog([source], state, active)[0];
  assert.equal(updated.lat, 10.85);
  assert.equal(updated.sourceDistrict, undefined);
  assert.equal(updated.demoChange?.effectiveUntil, expired);
  assert.equal(nextWorkflowBoundary(state, active), expired);
  assert.equal(projectCatalog([source], state, expired)[0], source);
  const original = tripSnapshot(source);
  assert.equal(tripNeedsReview(original, updated), true);
  assert.equal(tripNeedsReview(original, updated, placeRevision(updated)!), false);
  assert.equal(tripNeedsReview(tripSnapshot(updated), source), true);
});

test("moderation refers to the review version and original photo index without mutating the review", () => {
  const draft = { kind: "report", placeId: source.id, reason: "Báo cáo ảnh kiểm thử", reviewVersion: start, photoIndex: 0 } as const;
  const pending = saved(submitRequest(EMPTY_WORKFLOW, context(), "user", draft, "report"));
  assert.deepEqual(visibleReview(pending, review), review);
  assert.equal(pending.requests[0].reportSnapshot?.photo, "ảnh 1");
  const resolved = saved(decideRequest(pending, context([source], later), "report", "approved", "Ẩn ảnh được báo cáo", "hide-photo"));
  assert.equal(visibleReview(resolved, review)?.rating, 4);
  assert.deepEqual(visibleReviewPhotos(resolved, review), [{ src: "ảnh 2", index: 1 }]);
  assert.deepEqual(review.photos, ["ảnh 1", "ảnh 2"]);
  const edited = { ...review, updatedAt: later, rating: 5 };
  assert.equal(visibleReview(resolved, edited), edited);
  assert.equal(typeof decideRequest(pending, context([source], later, [edited]), "report", "approved", "Duyệt", "hide-photo"), "string");
  const second = saved(submitRequest(resolved, context([source], later, [edited]), "user",
    { ...draft, reviewVersion: later, photoIndex: undefined }, "second"));
  const hidden = saved(decideRequest(second, context([source], later, [edited]), "second", "approved", "Ẩn nội dung", "hide-review"));
  assert.equal(visibleReview(hidden, edited), undefined);
  assert.equal(edited.rating, 5);
});

test("a form opened before a scheduled update cannot submit or supplement against the stale revision", () => {
  const scheduled = { kind: "update", placeId: source.id, reason: "Đổi giờ sau", change: "hours",
    patch: { hours: "09:00–17:00" }, effectiveFrom: "2026-11-09T09:00" } as const;
  const draft = { kind: "update", placeId: source.id, reason: "Cập nhật mô tả", patch: { description: "Mô tả đã sửa" },
    expectedRevision: placeRevision(source) } as const;
  let state = saved(submitRequest(EMPTY_WORKFLOW, context(), "user", scheduled, "scheduled"));
  state = saved(decideRequest(state, context(), "scheduled", "approved", "Duyệt lịch mới"));
  state = saved(submitRequest(state, context(), "user", draft, "supplement"));
  state = saved(decideRequest(state, context(), "supplement", "needs-info", "Bổ sung mô tả"));
  const activeAt = "2026-11-09T02:00:00.000Z";
  const active = projectCatalog([source], state, activeAt);
  assert.equal(active[0].hours, "09:00–17:00");
  assert.equal(typeof submitRequest(state, context(active, activeAt), "user", draft, "stale"), "string");
  assert.equal(typeof submitRequest(state, context(active, activeAt), "user", draft, "supplement", "supplement"), "string");
  assert.equal(state.requests[1].status, "needs-info");
  const refreshed = saved(submitRequest(state, context(active, activeAt), "user",
    { ...draft, expectedRevision: placeRevision(active[0]) }, "supplement", "supplement"));
  assert.equal(refreshed.requests[1].status, "pending");
  assert.equal(refreshed.requests[1].before?.hours, "09:00–17:00");
});

test("approved price changes leave the old trip budget until keep, update, or replace is chosen", () => {
  const pending = saved(submitRequest(EMPTY_WORKFLOW, context(), "user", {
    kind: "update", placeId: source.id, reason: "Bổ sung giá", patch: { price: 45000 },
  }, "price"));
  const state = saved(decideRequest(pending, context(), "price", "approved", "Đã kiểm tra trong bản thử"));
  const currentPlace = projectCatalog([source], state, start)[0];
  const snapshot = tripSnapshot(source);
  assert.equal(snapshot.price, null);
  assert.equal(currentPlace.price, 45000);
  assert.equal(tripNeedsReview(snapshot, currentPlace), true);
  const { price: _, ...older } = snapshot;
  assert.equal(tripNeedsReview(older, currentPlace), false);
  const trip: TripItem[] = [{ placeId: source.id, time: "10:15", snapshot }];
  const item = { placeId: source.id, snapshot, currentPlace };
  function points(result: TripItem[] | string) {
    assert.ok(Array.isArray(result), typeof result === "string" ? result : undefined);
    return result;
  }
  const kept = points(resolveTripSelection(trip, item, "keep"))[0];
  assert.equal(kept.snapshot?.price, null);
  assert.equal(tripNeedsReview(kept.snapshot!, currentPlace, kept.keptRevision), false);
  const updated = points(resolveTripSelection(trip, item, "update"))[0];
  assert.equal(updated.snapshot?.price, 45000);
  const alternative: Place = { ...source, id: "osm:node/2", price: 28000 };
  const replaced = points(resolveTripSelection(trip, item, "update", alternative))[0];
  assert.equal(replaced.placeId, alternative.id);
  assert.equal(replaced.snapshot?.price, 28000);
  assert.equal(replaced.time, "10:15");
  assert.equal(typeof resolveTripSelection([...trip, { placeId: alternative.id, time: "11:00" }], item, "update", alternative), "string");
});
