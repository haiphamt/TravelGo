import type { Place } from "./data.ts";
import { MAX_FILE_BYTES, normalize } from "./logic.ts";
import type { Review, TripItem, TripSnapshot } from "./logic.ts";

export type DemoActor = "user" | "owner" | "admin";
export type Actor = DemoActor;
type Author = Exclude<DemoActor, "admin">;
export type RequestKind = "new" | "update" | "claim" | "report";
export type RequestStatus = "pending" | "needs-info" | "approved" | "rejected" | "withdrawn" | "revoked";
export type ChangeKind = "details" | "hours" | "temporary-move" | "permanent-move" | "pause" | "closed";
export type ReportAction = "keep" | "hide-photo" | "hide-review";
export type WorkflowDecision = "approved" | "rejected" | "needs-info" | "revoked";

export interface PlacePatch {
  name?: string;
  area?: string;
  category?: Place["category"];
  description?: string;
  hours?: string | null;
  products?: string[];
  lat?: number | null;
  lng?: number | null;
  price?: number | null;
  photo?: { dataUrl: string; credit: string; rightsConfirmed: boolean };
}
export interface WorkflowDraft {
  kind: RequestKind;
  placeId?: string;
  reason: string;
  relationship?: "owner" | "representative";
  evidence?: string;
  agreement?: boolean;
  hcmConfirmed?: boolean;
  change?: ChangeKind;
  patch?: PlacePatch;
  effectiveFrom?: string;
  effectiveUntil?: string;
  expectedRevision?: string | null;
  reviewVersion?: string;
  photoIndex?: number;
}
export interface WorkflowRequest extends WorkflowDraft {
  id: string;
  placeId: string;
  actor: Author;
  status: RequestStatus;
  baseRevision: string | null;
  before: Place | null;
  createdAt: string;
  updatedAt: string;
  history: { actor: DemoActor; status: RequestStatus; reason: string; at: string }[];
  reportAction?: ReportAction;
  reportSnapshot?: Pick<Review, "rating" | "text" | "visitedOn" | "updatedAt"> & { photo?: string };
}
export type WorkflowEntry = WorkflowRequest;
export interface OwnerReply {
  placeId: string;
  reviewVersion: string;
  text: string;
  updatedAt: string;
}
export interface WorkflowState {
  requests: WorkflowRequest[];
  replies: OwnerReply[];
}
export const EMPTY_WORKFLOW: WorkflowState = { requests: [], replies: [] };
export const workflowLabels = {
  actor: { user: "Người dùng", owner: "Chủ cơ sở", admin: "Quản trị viên" },
  kind: { new: "Địa điểm mới", update: "Cập nhật địa điểm", claim: "Yêu cầu quản lý", report: "Báo cáo đánh giá" },
  status: {
    pending: "Đang chờ", "needs-info": "Cần bổ sung", approved: "Đã duyệt",
    rejected: "Từ chối", withdrawn: "Đã rút", revoked: "Đã thu hồi quyền",
  },
  change: {
    details: "Thông tin chung", hours: "Đổi giờ bán", "temporary-move": "Chuyển tạm",
    "permanent-move": "Chuyển hẳn", pause: "Tạm nghỉ", closed: "Ngừng bán",
  },
  reportAction: { keep: "Giữ đánh giá", "hide-photo": "Ẩn ảnh được báo cáo", "hide-review": "Ẩn đánh giá" },
} satisfies Record<string, Record<string, string>>;

const categories = ["coffee", "food", "nature", "culture", "drink", "lodging"];
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
export function placeRevision(place?: Place): string | null {
  return place ? place.demoChange?.revision ?? `source:${place.sourceUpdatedAt ?? ""}` : null;
}
export function managesPlace(state: WorkflowState, id: string) {
  return state.requests.some(item => item.kind === "claim" && item.status === "approved" && item.placeId === id);
}
export function tripSnapshot(place: Place): TripSnapshot {
  const { name, area, lat, lng, hours, price, demoChange } = place;
  return { name, area, lat, lng, hours, price, status: demoChange?.status ?? null };
}
export function tripNeedsReview(saved: TripSnapshot, current: Place, keptRevision?: string) {
  if (keptRevision === placeRevision(current)) return false;
  const fresh = tripSnapshot(current);
  return (Object.keys(fresh) as (keyof TripSnapshot)[]).some(key =>
    (key !== "price" || saved.price !== undefined) && fresh[key] !== saved[key]);
}
export function validTripSnapshot(value?: TripSnapshot): value is TripSnapshot {
  return !!value && typeof value.name === "string" && typeof value.area === "string" &&
    (value.lat === null || (Number.isFinite(value.lat) && Math.abs(value.lat) <= 90)) &&
    (value.lng === null || (Number.isFinite(value.lng) && Math.abs(value.lng) <= 180)) &&
    (value.hours === null || typeof value.hours === "string") &&
    (value.price == null || (Number.isFinite(value.price) && value.price >= 0)) &&
    (value.status === null || value.status === "paused" || value.status === "closed");
}
export function resolveTripSelection(
  trip: TripItem[],
  item: { placeId: string; snapshot: TripSnapshot; currentPlace: Place },
  decision: "update" | "keep",
  replacement?: Place,
): TripItem[] | string {
  const place = replacement ?? item.currentPlace;
  if (place.city !== item.currentPlace.city ||
      (place.id !== item.placeId && trip.some(point => point.placeId === place.id))) {
    return "Chọn điểm thay thế hợp lệ và chưa có trong lịch trình.";
  }
  return trip.map(point => {
    if (point.placeId !== item.placeId) return point;
    if (decision === "keep" && !replacement) {
      return { ...point, snapshot: item.snapshot, keptRevision: placeRevision(item.currentPlace)! };
    }
    return { ...point, placeId: place.id, snapshot: tripSnapshot(place), keptRevision: undefined,
      estimatedCost: place.id === point.placeId ? point.estimatedCost : undefined };
  });
}

export function restoreWorkflow(value?: WorkflowState): WorkflowState {
  if (!value || !Array.isArray(value.requests) || !Array.isArray(value.replies)) return EMPTY_WORKFLOW;
  return {
    requests: value.requests.filter(item => item && typeof item.id === "string" && typeof item.placeId === "string" &&
      Object.hasOwn(workflowLabels.kind, item.kind) && Object.hasOwn(workflowLabels.status, item.status) &&
      (item.actor === "user" || item.actor === "owner") && typeof item.reason === "string" &&
      typeof item.createdAt === "string" && typeof item.updatedAt === "string" && Array.isArray(item.history) &&
      item.history.every(event => event && Object.hasOwn(workflowLabels.actor, event.actor) &&
        Object.hasOwn(workflowLabels.status, event.status) && typeof event.reason === "string" && typeof event.at === "string") &&
      (!item.patch?.photo || validPhoto(item.patch.photo))),
    replies: value.replies.filter(reply => reply && typeof reply.placeId === "string" &&
      typeof reply.reviewVersion === "string" && typeof reply.text === "string" && typeof reply.updatedAt === "string"),
  };
}

// A local input means TP.HCM time. Reject calendar rollovers rather than changing the date.
function effectiveDate(value?: string): string | null {
  if (!value) return "";
  const match = /^(\d{4}-\d{2}-\d{2})(?:T([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d)(?:\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})?)?$/.exec(value);
  if (!match) return null;
  const day = new Date(match[1] + "T12:00:00Z");
  if (!Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== match[1]) return null;
  const iso = new Date(match[5] ? value : (match[2] ? value : value + "T00:00:00") + "+07:00");
  return Number.isFinite(iso.getTime()) ? iso.toISOString() : null;
}

function validPhoto(photo: PlacePatch["photo"]): boolean {
  if (!photo || !photo.rightsConfirmed || !text(photo.credit) || photo.credit.length > 160) return false;
  if (typeof photo.dataUrl !== "string" || photo.dataUrl.length > 4 * Math.ceil(MAX_FILE_BYTES / 3) + 32) return false;
  const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(photo.dataUrl);
  if (!match || match[2].length % 4) return false;
  const bytes = atob(match[2].slice(0, 16));
  if (match[1] === "jpeg") return bytes.startsWith("\xff\xd8\xff");
  if (match[1] === "png") return bytes.startsWith("\x89PNG\r\n\x1a\n");
  return bytes.startsWith("RIFF") && bytes.slice(8, 12) === "WEBP";
}

function cleanPatch(patch: PlacePatch | undefined, before: Place | null): PlacePatch | string {
  if (!patch) return {};
  const result: PlacePatch = {};
  for (const field of ["name", "area", "description", "hours"] as const) {
    const value = patch[field];
    if (value === undefined) continue;
    if (field === "hours" && value === null) {
      if (before?.hours !== null) result.hours = null;
      continue;
    }
    const limit = field === "description" ? 1200 : 240;
    if (typeof value !== "string" || value.trim().length > limit || (field === "name" && !value.trim())) {
      return "Kiểm tra lại tên, địa chỉ, mô tả hoặc giờ bán.";
    }
    const cleaned = field === "hours" ? value.trim() || null : value.trim();
    if (cleaned === before?.[field]) continue;
    if (field === "hours") result.hours = cleaned;
    else result[field] = cleaned ?? "";
  }
  if (patch.category !== undefined) {
    if (!categories.includes(patch.category)) return "Chọn danh mục địa điểm hợp lệ.";
    if (patch.category !== before?.category) result.category = patch.category;
  }
  if (patch.products !== undefined) {
    if (!Array.isArray(patch.products) || patch.products.length > 20 ||
        patch.products.some(item => typeof item !== "string" || item.trim().length > 100)) {
      return "Nhập tối đa 20 món, mỗi món tối đa 100 ký tự.";
    }
    const products = [...new Set(patch.products.map(item => item.trim()).filter(Boolean))];
    if (JSON.stringify(products) !== JSON.stringify(before?.products ?? [])) result.products = products;
  }
  if (patch.lat !== undefined || patch.lng !== undefined) {
    const lat = patch.lat === undefined ? before?.lat ?? null : patch.lat;
    const lng = patch.lng === undefined ? before?.lng ?? null : patch.lng;
    if ((lat === null) !== (lng === null) || (lat !== null && (!Number.isFinite(lat) || Math.abs(lat) > 90)) ||
        (lng !== null && (!Number.isFinite(lng) || Math.abs(lng) > 180))) {
      return "Nhập đủ tọa độ hợp lệ hoặc để trống cả hai.";
    }
    if (lat !== before?.lat || lng !== before?.lng) {
      result.lat = lat;
      result.lng = lng;
    }
  }
  if (patch.price !== undefined) {
    if (patch.price !== null && (!Number.isSafeInteger(patch.price) || patch.price < 0)) return "Nhập giá bằng số nguyên không âm hoặc để trống.";
    if (patch.price !== before?.price) result.price = patch.price;
  }
  if (patch.photo !== undefined) {
    if (!validPhoto(patch.photo)) return "Ảnh cần đúng định dạng JPG, PNG hoặc WebP, tối đa 5 MB, có nguồn và xác nhận quyền sử dụng.";
    result.photo = { ...patch.photo, credit: patch.photo.credit.trim() };
  }
  return result;
}

interface Context {
  places: readonly Place[];
  reviews: readonly Review[];
  now: string;
}
type Result = WorkflowState | string;
const open = (request: WorkflowRequest) => request.status === "pending" || request.status === "needs-info";
const effectiveAt = (request: WorkflowRequest) => request.effectiveFrom && request.effectiveFrom > request.updatedAt
  ? request.effectiveFrom : request.updatedAt;
const sameId = (request: WorkflowRequest, id: string) => request.placeId === id;

export function nextWorkflowBoundary(state: WorkflowState, now: string): string | undefined {
  return state.requests.filter(item => item.status === "approved" && (item.kind === "new" || item.kind === "update"))
    .flatMap(item => [effectiveAt(item), item.effectiveUntil ?? ""]).filter(value => value > now).sort()[0];
}

export function submitRequest(state: WorkflowState, context: Context, actor: DemoActor, draft: WorkflowDraft, id: string, resubmitId?: string): Result {
  if (actor !== "user" && actor !== "owner") return "Chọn khu vực phù hợp để gửi yêu cầu.";
  const prior = resubmitId ? state.requests.find(item => item.id === resubmitId) : undefined;
  if (resubmitId && (!prior || prior.actor !== actor || prior.status !== "needs-info" ||
      prior.kind !== draft.kind || (draft.placeId !== undefined && draft.placeId !== prior.placeId))) {
    return "Yêu cầu này không thể gửi lại từ khu vực hiện tại.";
  }
  const reason = text(draft.reason);
  if (!reason || reason.length > 600) return "Nhập lý do, tối đa 600 ký tự.";
  const placeId = prior?.placeId ?? (draft.kind === "new" ? `tg-demo-${id}` : draft.placeId);
  if (!placeId) return "Chọn một địa điểm.";
  const before = context.places.find(place => place.id === placeId) ?? null;
  if (draft.kind !== "new" && !before) return "Địa điểm không còn trong danh mục.";
  if (draft.kind === "update" && draft.expectedRevision !== undefined && draft.expectedRevision !== placeRevision(before ?? undefined)) {
    return "Hồ sơ đã thay đổi trong lúc bạn nhập. Hãy mở lại biểu mẫu để đối chiếu phiên bản hiện tại.";
  }
  if (draft.kind === "new" && (actor !== "user" || before)) return "Mở Đóng góp của tôi để gửi địa điểm mới.";
  if (actor === "owner" && draft.kind !== "claim" && !managesPlace(state, placeId)) return "Địa điểm chưa được cấp quyền cho khu vực Chủ cơ sở.";
  const entry: WorkflowRequest = {
    id: prior?.id ?? id, kind: draft.kind, placeId, actor, reason, before, status: "pending",
    baseRevision: placeRevision(before ?? undefined), createdAt: prior?.createdAt ?? context.now, updatedAt: context.now,
    history: [...(prior?.history ?? []), { actor, status: "pending", reason, at: context.now }],
  };
  if (draft.kind === "claim") {
    const evidence = text(draft.evidence);
    if (actor !== "owner") return "Mở khu vực Chủ cơ sở để gửi yêu cầu quản lý.";
    if (!["owner", "representative"].includes(draft.relationship ?? "") || !draft.agreement || !evidence || evidence.length > 600) {
      return "Chọn vai trò, nhập thông tin đối chiếu và xác nhận sự đồng ý trước khi gửi.";
    }
    if (managesPlace(state, placeId) || state.requests.some(item => item.id !== prior?.id && item.kind === "claim" && sameId(item, placeId) && open(item))) {
      return "Địa điểm đã được cấp quyền hoặc có yêu cầu đang xử lý.";
    }
    Object.assign(entry, { relationship: draft.relationship, evidence, agreement: true });
  } else if (draft.kind === "report") {
    const review = context.reviews.find(item => item.placeId === placeId && item.updatedAt === draft.reviewVersion);
    const photoIndex = draft.photoIndex;
    if ((prior && (prior.reviewVersion !== draft.reviewVersion || prior.photoIndex !== photoIndex)) ||
        !review || !visibleReview(state, review) || (photoIndex !== undefined &&
        (!Number.isInteger(photoIndex) || !review.photos[photoIndex] || hiddenPhotos(state, review).has(photoIndex)))) {
      return "Đánh giá hoặc ảnh đã thay đổi. Hãy mở lại phiên bản hiện hành.";
    }
    if (state.requests.some(item => item.id !== prior?.id && item.kind === "report" && sameId(item, placeId) &&
        item.reviewVersion === review.updatedAt && item.photoIndex === photoIndex && open(item))) {
      return "Báo cáo này đang được xử lý.";
    }
    const { rating, text, visitedOn, updatedAt } = review;
    Object.assign(entry, { reviewVersion: updatedAt, photoIndex,
      reportSnapshot: { rating, text, visitedOn, updatedAt, ...(photoIndex === undefined ? {} : { photo: review.photos[photoIndex] }) } });
  } else if (draft.kind === "new" || draft.kind === "update") {
    const patch = cleanPatch(draft.patch, before);
    if (typeof patch === "string") return patch;
    const change = draft.kind === "new" ? "details" : draft.change ?? "details";
    if (!Object.hasOwn(workflowLabels.change, change)) return "Chọn loại thay đổi hợp lệ.";
    if (draft.kind === "new" && (!patch.name || !patch.area || !patch.category)) return "Nhập tên, địa chỉ và danh mục của địa điểm.";
    if ((draft.kind === "new" || patch.lat !== undefined) && draft.hcmConfirmed !== true) return "Xác nhận địa điểm thuộc TP. Hồ Chí Minh.";
    if (draft.kind === "new" && context.places.some(place => normalize(place.name) === normalize(patch.name!) && normalize(place.area) === normalize(patch.area!))) {
      return "Tên và địa chỉ đã có trong danh mục. Hãy gửi đề xuất cập nhật hồ sơ hiện có.";
    }
    const moving = change === "temporary-move" || change === "permanent-move";
    if (moving && (patch.lat == null || patch.lng == null)) return "Nhập tọa độ mới khi đề xuất chuyển địa điểm.";
    if (change === "hours" && patch.hours === undefined) return "Nhập thay đổi giờ bán trước khi gửi.";
    if (draft.kind === "update" && !Object.keys(patch).length && change !== "pause" && change !== "closed") return "Chọn ít nhất một thông tin cần thay đổi.";
    const from = effectiveDate(draft.effectiveFrom), until = effectiveDate(draft.effectiveUntil);
    if (from === null || until === null || (until && (until <= (from || context.now) || until <= context.now))) {
      return "Chọn thời điểm hiệu lực và kết thúc hợp lệ.";
    }
    if ((change === "temporary-move" && !until) || (until && change !== "temporary-move" && change !== "pause")) {
      return "Chuyển tạm cần thời điểm kết thúc. Chỉ chuyển tạm hoặc tạm nghỉ được đặt ngày kết thúc.";
    }
    Object.assign(entry, { change, patch, effectiveFrom: from, effectiveUntil: until, hcmConfirmed: draft.hcmConfirmed === true });
  } else {
    return "Loại yêu cầu không hợp lệ.";
  }
  return { ...state, requests: prior ? state.requests.map(item => item.id === prior.id ? entry : item) : [...state.requests, entry] };
}

function transition(state: WorkflowState, request: WorkflowRequest, actor: DemoActor, status: RequestStatus, reason: string, at: string, reportAction?: ReportAction): WorkflowState {
  return { ...state, requests: state.requests.map(item => item.id === request.id ? {
    ...item, status, updatedAt: at, reportAction, history: [...item.history, { actor, status, reason, at }],
  } : item) };
}

export function withdrawRequest(state: WorkflowState, actor: DemoActor, id: string, now: string): Result {
  const item = state.requests.find(request => request.id === id);
  if (!item || actor !== item.actor || !open(item)) return "Chỉ người gửi mới có thể rút yêu cầu đang xử lý.";
  return transition(state, item, actor, "withdrawn", "Người gửi rút yêu cầu.", now);
}

export function decideRequest(state: WorkflowState, context: Context, id: string, decision: WorkflowDecision, reasonInput: string, reportAction?: ReportAction): Result {
  const request = state.requests.find(item => item.id === id);
  const reason = text(reasonInput);
  if (!request) return "Không tìm thấy yêu cầu.";
  if (decision === "revoked") {
    if (request.kind !== "claim" || request.status !== "approved") return "Chỉ thu hồi quyền quản lý đã được cấp.";
  } else if (request.status !== "pending" || !["approved", "rejected", "needs-info"].includes(decision)) {
    return "Yêu cầu không còn chờ xét duyệt.";
  }
  if (!reason || reason.length > 600) return "Nhập lý do xử lý, tối đa 600 ký tự.";
  if (decision !== "approved") return transition(state, request, "admin", decision, reason, context.now);
  const place = context.places.find(item => item.id === request.placeId);
  if (request.kind === "update") {
    if (!place || placeRevision(place) !== request.baseRevision ||
        state.requests.some(item => item.kind === "update" && item.status === "approved" &&
          sameId(item, request.placeId) && effectiveAt(item) > context.now)) {
      return "Hồ sơ đã thay đổi hoặc có cập nhật sắp hiệu lực. Yêu cầu bổ sung để đối chiếu lại.";
    }
    if (request.actor === "owner" && !managesPlace(state, request.placeId)) return "Người gửi không còn quyền quản lý địa điểm.";
    if (request.effectiveUntil && request.effectiveUntil <= context.now) return "Thời hạn đã qua. Yêu cầu người gửi cập nhật thời gian.";
  }
  if (request.kind === "new") {
    const samePlace = (item?: PlacePatch) => normalize(item?.name ?? "") === normalize(request.patch?.name ?? "") &&
      normalize(item?.area ?? "") === normalize(request.patch?.area ?? "");
    if (place || context.places.some(samePlace) ||
        state.requests.some(item => item.kind === "new" && item.status === "approved" && samePlace(item.patch))) {
      return "Địa điểm đã có trong danh mục hoặc đang chờ hiệu lực.";
    }
  }
  if (request.kind === "claim" && (!place || managesPlace(state, request.placeId))) return "Địa điểm không còn đủ điều kiện cấp quyền.";
  if (request.kind === "report") {
    const review = context.reviews.find(item => item.placeId === request.placeId && item.updatedAt === request.reviewVersion);
    if (!review || !visibleReview(state, review)) return "Đánh giá đã thay đổi hoặc đã được xử lý. Có thể từ chối báo cáo kèm lý do.";
    if (!reportAction || !Object.hasOwn(workflowLabels.reportAction, reportAction)) return "Chọn cách xử lý báo cáo.";
    if (reportAction === "hide-photo" && (request.photoIndex === undefined || !review.photos[request.photoIndex])) {
      return "Chọn ẩn ảnh chỉ khi báo cáo có ảnh cụ thể.";
    }
  }
  return transition(state, request, "admin", "approved", reason, context.now, request.kind === "report" ? reportAction : undefined);
}

export function projectCatalog(source: Place[], state: WorkflowState, now: string): Place[] {
  const changes = state.requests.filter(item => item.status === "approved" &&
    (item.kind === "new" || item.kind === "update") && effectiveAt(item) <= now &&
    (!item.effectiveUntil || item.effectiveUntil > now))
    .sort((a, b) => effectiveAt(a).localeCompare(effectiveAt(b)) || a.updatedAt.localeCompare(b.updatedAt));
  if (!changes.length) return source;
  const places = new Map(source.map(place => [place.id, place]));
  for (const request of changes) {
    let place = places.get(request.placeId);
    const { photo, ...patch } = request.patch ?? {};
    if (!place && request.kind === "new" && patch.name && patch.area && patch.category) {
      place = {
        id: request.placeId, city: "hcm", category: patch.category, local: false, name: patch.name, area: patch.area,
        description: "", products: [], price: null, hours: null, lat: null, lng: null, image: null, images: [],
        updated: null, sourceUpdatedAt: null, sourceUrl: "", sourceLabel: "Đóng góp trong bản dùng thử",
        sourceLicense: "Thông tin do người gửi cung cấp", referenceOnly: true, photoCredit: null,
      };
    }
    if (!place) continue;
    const kind = request.change ?? "details";
    const prior = place.demoChange;
    places.set(place.id, {
      ...place, ...patch,
      ...(patch.area !== undefined || patch.lat !== undefined || patch.lng !== undefined ? { sourceDistrict: undefined } : {}),
      ...(photo ? { image: photo.dataUrl, images: [photo.dataUrl], photoCredit: photo.credit, photoSource: undefined } : {}),
      demoChange: {
        revision: [prior?.revision, request.id].filter(Boolean).join("/"), kind,
        effectiveFrom: effectiveAt(request), effectiveUntil: request.effectiveUntil || null,
        status: kind === "pause" ? "paused" : kind === "closed" ? "closed" : prior?.status,
        fields: [...new Set([...(prior?.fields ?? []), ...Object.keys(request.patch ?? {})])],
      },
    });
  }
  return [...places.values()];
}

function reportDecisions(state: WorkflowState, review: Review) {
  return state.requests.filter(item => item.kind === "report" && item.status === "approved" &&
    item.placeId === review.placeId && item.reviewVersion === review.updatedAt);
}
function hiddenPhotos(state: WorkflowState, review: Review): Set<number> {
  return new Set(reportDecisions(state, review).flatMap(item =>
    item.reportAction === "hide-photo" && item.photoIndex !== undefined ? [item.photoIndex] : []));
}
export function visibleReview(state: WorkflowState, review?: Review): Review | undefined {
  if (!review || reportDecisions(state, review).some(item => item.reportAction === "hide-review")) return undefined;
  const hidden = hiddenPhotos(state, review);
  return hidden.size ? { ...review, photos: review.photos.filter((_, index) => !hidden.has(index)) } : review;
}
export function visibleReviewPhotos(state: WorkflowState, review?: Review): { src: string; index: number }[] {
  if (!review || !visibleReview(state, review)) return [];
  const hidden = hiddenPhotos(state, review);
  return review.photos.flatMap((src, index) => hidden.has(index) ? [] : [{ src, index }]);
}
export function saveReply(state: WorkflowState, review: Review | undefined, placeId: string, input: string, now: string): Result {
  const reply = text(input);
  if (!managesPlace(state, placeId)) return "Địa điểm chưa được cấp quyền cho khu vực Chủ cơ sở.";
  if (!review || !visibleReview(state, review)) return "Đánh giá không còn hiển thị.";
  if (reply.length > 500) return "Phản hồi tối đa 500 ký tự.";
  const replies = state.replies.filter(item => item.placeId !== placeId || item.reviewVersion !== review.updatedAt);
  if (reply) replies.push({ placeId, reviewVersion: review.updatedAt, text: reply, updatedAt: now });
  return { ...state, replies };
}
