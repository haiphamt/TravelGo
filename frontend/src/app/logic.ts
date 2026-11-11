import type { WorkflowState } from "./workflow.ts";
import type { RoomState } from "./room-state.ts";

export interface Review {
  placeId: string;
  rating: number;
  text: string;
  photos: string[];
  visitedOn: string;
  updatedAt: string;
}
export interface TripItem {
  placeId: string;
  time: string;
  date?: string;
  note?: string;
  estimatedCost?: number | null;
  snapshot?: TripSnapshot;
  keptRevision?: string;
}
export interface TripSnapshot {
  name: string;
  area: string;
  lat: number | null;
  lng: number | null;
  hours: string | null;
  price?: number | null;
  status: "paused" | "closed" | null;
}
export interface TripDraft {
  name: string;
  date: string;
  endDate?: string;
  note?: string;
  budget?: number | null;
  cover?: string;
  source?: "manual" | "ai-demo" | "room";
  points: TripItem[];
}
export interface SavedTrip extends TripDraft {
  id: string;
}
export function validTripDate(value: string): boolean {
  const date = new Date(`${value}T12:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function validTripTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}
export function validTripBudget(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}
export function validTripCover(value: unknown): value is string {
  return typeof value === "string" && value.length <= Math.ceil(1024 * 1024 / 3) * 4 + 32 &&
    /^data:image\/(?:jpeg|png|webp);base64,[a-z0-9+/]+={0,2}$/i.test(value);
}
export function tripDay(point: Pick<TripItem, "date">, start: string): string {
  return point.date || start;
}
export function orderTripDays(points: TripItem[], start: string): TripItem[] {
  return [...points].sort((left, right) => tripDay(left, start).localeCompare(tripDay(right, start)));
}
export function validateTripDraft(draft: TripDraft): string {
  if (!draft.name.trim() || draft.name.trim().length > 80) return "Nhập tên chuyến đi tối đa 80 ký tự.";
  if ((draft.date && !validTripDate(draft.date)) ||
      (draft.endDate && (!draft.date || !validTripDate(draft.endDate) || draft.endDate < draft.date))) {
    return "Chọn ngày bắt đầu và ngày kết thúc hợp lệ.";
  }
  if ((draft.note?.length ?? 0) > 500) return "Ghi chú chuyến đi tối đa 500 ký tự.";
  if (draft.cover && !validTripCover(draft.cover)) return "Chọn ảnh bìa JPG, PNG hoặc WebP tối đa 1 MB.";
  if (draft.budget != null && !validTripBudget(draft.budget)) return "Nhập ngân sách bằng số nguyên không âm.";
  if (!draft.points.length || draft.points.length > 5) return "Chọn từ 1 đến 5 điểm ghé.";
  if (new Set(draft.points.map(point => point.placeId)).size !== draft.points.length) return "Mỗi địa điểm chỉ được thêm một lần.";
  if (draft.points.some(point => !validTripTime(point.time) || (point.note?.length ?? 0) > 180)) {
    return "Kiểm tra giờ ghé và ghi chú từng điểm (tối đa 180 ký tự).";
  }
  if (draft.points.some(point => point.estimatedCost != null && !validTripBudget(point.estimatedCost))) {
    return "Nhập dự trù từng điểm bằng số nguyên không âm.";
  }
  if (draft.points.some(point => point.date && (!draft.date || !validTripDate(point.date) || point.date < draft.date || point.date > (draft.endDate || draft.date)))) {
    return "Ngày ghé phải nằm trong khoảng ngày của chuyến đi.";
  }
  return "";
}
export function appendTripPoint(
  trip: TripItem[],
  id: string,
  places: ReadonlyArray<{ id: string; city: string }>,
): TripItem[] | string {
  const place = places.find((item) => item.id === id);
  if (!place) return "Không tìm thấy địa điểm để thêm.";
  if (trip.some((item) => item.placeId === id))
    return "Địa điểm đã có trong lịch trình.";
  if (
    trip.some((item) => {
      const existing = places.find((known) => known.id === item.placeId);
      return existing !== undefined && existing.city !== place.city;
    })
  )
    return "Lịch trình hiện tại thuộc thành phố khác. Hãy bỏ các điểm cũ trước khi đổi thành phố.";
  if (trip.length >= 5)
    return "Bản dùng thử hỗ trợ tối đa 5 điểm trong một lịch trình.";
  return [
    ...trip,
    { placeId: id, time: `${String(8 + trip.length * 2).padStart(2, "0")}:00` },
  ];
}
export function setTripTime(trip: TripItem[], placeId: string, time: string): TripItem[] {
  if (!validTripTime(time)) return trip;
  return trip.map((item) => item.placeId === placeId ? { ...item, time } : item);
}
export function swapTripPoints(trip: TripItem[], placeId: string, neighborId: string): TripItem[] {
  const index = trip.findIndex((item) => item.placeId === placeId);
  const target = trip.findIndex((item) => item.placeId === neighborId);
  if (index < 0 || target < 0 || index === target) return trip;
  const reordered = [...trip];
  [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
  return reordered;
}
export function removeTripPoint(trip: TripItem[], placeId: string): TripItem[] {
  return trip.filter((item) => item.placeId !== placeId);
}
export interface DemoState {
  favorites: string[];
  reviews: Review[];
  trip: TripItem[];
  tripName: string;
  tripDate: string;
  tripEndDate?: string;
  tripNote?: string;
  tripBudget?: number | null;
  tripCover?: string;
  tripSource?: TripDraft["source"];
  tripId?: string;
  savedTrips?: SavedTrip[];
  roomState?: RoomState;
  workflow?: WorkflowState;
}
export const EMPTY_STATE: DemoState = {
  favorites: [],
  reviews: [],
  trip: [],
  tripName: "Chuyến đi của mình",
  tripDate: "",
};
export const MAX_PHOTOS = 3;
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_REVIEW_TEXT = 500;
export function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .trim();
}
export function validatePhoto(
  file: { type: string; size: number },
  count: number,
): string {
  if (count >= MAX_PHOTOS)
    return "Bạn có thể thêm tối đa 3 ảnh. Hãy bỏ một ảnh trước khi thêm.";
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    return "Chọn ảnh JPG, PNG hoặc WebP.";
  if (!file.size || file.size > MAX_FILE_BYTES)
    return "Mỗi ảnh cần nhỏ hơn hoặc bằng 5 MB và không được rỗng.";
  return "";
}
export function localToday(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
export function validateReview(
  review: Pick<Review, "rating" | "text" | "photos" | "visitedOn">,
  today = localToday(),
): string {
  if (
    !Number.isInteger(review.rating) ||
    review.rating < 1 ||
    review.rating > 5
  )
    return "Hãy chọn mức đánh giá từ 1 đến 5 sao.";
  if (review.text.trim().length > MAX_REVIEW_TEXT)
    return "Nhận xét tối đa 500 ký tự.";
  if (review.photos.length > MAX_PHOTOS) return "Bạn có thể thêm tối đa 3 ảnh.";
  if (review.visitedOn) {
    const parsed = new Date(review.visitedOn + "T12:00:00Z");
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(review.visitedOn) ||
      review.visitedOn > today ||
      !Number.isFinite(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== review.visitedOn
    )
      return "Chọn ngày đã ghé hợp lệ, không ở tương lai.";
  }
  return "";
}
export function upsertReview(reviews: Review[], review: Review): Review[] {
  return [...reviews.filter((item) => item.placeId !== review.placeId), review];
}
export function mapsLink(points: { lat: number | null; lng: number | null }[]): string {
  if (!points.length || points.some(point => typeof point.lat !== "number" || typeof point.lng !== "number" ||
    !Number.isFinite(point.lat) || !Number.isFinite(point.lng) || Math.abs(point.lat) > 90 || Math.abs(point.lng) > 180)) return "";
  const params = new URLSearchParams({
    api: "1",
    destination: `${points.at(-1)!.lat},${points.at(-1)!.lng}`,
  });
  if (points.length > 1)
    params.set("origin", `${points[0].lat},${points[0].lng}`);
  if (points.length > 2)
    params.set(
      "waypoints",
      points
        .slice(1, -1)
        .map((p) => `${p.lat},${p.lng}`)
        .join("|"),
    );
  return `https://www.google.com/maps/dir/?${params}`;
}
