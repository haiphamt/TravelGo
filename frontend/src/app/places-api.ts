import { isPlaceFacet, type Category, type Place, type PlaceFacet } from "./data.ts";
import { parseLocalProfile } from "./catalog.ts";
import { validPlaceId } from "./trip-storage.ts";
import { validTripDate, type Review } from "./logic.ts";

type RecordValue = Record<string, unknown>;
const record = (value: unknown): RecordValue => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Dữ liệu API không hợp lệ.");
  return value as RecordValue;
};
const text = (value: unknown, fallback = ""): string => {
  if (value == null) return fallback;
  if (typeof value !== "string") throw new Error("Trường văn bản API không hợp lệ.");
  return value;
};
const list = (value: unknown): string[] => {
  if (value == null) return [];
  if (!Array.isArray(value) || value.some(item => typeof item !== "string")) throw new Error("Danh sách API không hợp lệ.");
  return value as string[];
};
const number = (value: unknown, min: number, max: number): number | null => {
  if (value == null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) throw new Error("Trường số API không hợp lệ.");
  return value;
};
const integer = (value: unknown, min = 0): number => {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min) throw new Error("Phân trang API không hợp lệ.");
  return value;
};
function url(value: unknown, media = false): string {
  const result = text(value);
  if (!result) return "";
  if (media && /^\/(?:images\/[a-zA-Z0-9_./-]+|api\/review-photos\/[0-9]+)$/.test(result) && !result.includes("..")) return result;
  const parsed = new URL(result);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) throw new Error("Liên kết API không hợp lệ.");
  return result;
}
function date(value: unknown): string | null {
  if (value == null || value === "") return null;
  const result = text(value);
  if (!Number.isFinite(Date.parse(result))) throw new Error("Ngày API không hợp lệ.");
  return result;
}

export function parseApiPlace(input: unknown): Place {
  const value = record(input);
  const id = text(value["id"]);
  const category = text(value["category"]);
  const name = text(value["name"]);
  if (!validPlaceId(id) || !name.trim() || value["city"] !== "hcm" ||
      !["coffee", "food", "nature", "culture", "drink", "lodging"].includes(category) ||
      typeof value["local"] !== "boolean" || typeof value["referenceOnly"] !== "boolean") throw new Error("Hồ sơ API không hợp lệ.");
  const images = list(value["images"]).map(item => url(item, true));
  const image = value["image"] == null ? null : url(value["image"], true);
  if ((image && !images.includes(image)) || images.some(item => !item)) throw new Error("Ảnh API không hợp lệ.");
  let photoSource: Place["photoSource"];
  if (value["photoSource"] != null) {
    const photo = record(value["photoSource"]);
    photoSource = { url: url(photo["url"]), license: text(photo["license"]), licenseUrl: url(photo["licenseUrl"]) };
    if (!photoSource.url || !photoSource.license || !photoSource.licenseUrl) throw new Error("Nguồn ảnh API không hợp lệ.");
  }
  const photoCredit = value["photoCredit"] == null ? null : text(value["photoCredit"]);
  if (!value["local"] && images.length && (!photoCredit || !photoSource)) throw new Error("Ảnh địa điểm thiếu ghi công hoặc giấy phép.");
  return {
    id, name, city: "hcm", category: category as Place["category"], local: value["local"],
    area: text(value["area"], "Chưa cập nhật địa chỉ") || "Chưa cập nhật địa chỉ",
    sourceDistrict: text(value["sourceDistrict"]) || undefined,
    price: number(value["price"], 0, Number.MAX_SAFE_INTEGER),
    lat: number(value["lat"], -90, 90), lng: number(value["lng"], -180, 180),
    hours: value["hours"] == null ? null : text(value["hours"]),
    image, images, products: list(value["products"]), description: text(value["description"]),
    updated: date(value["updated"]), sourceUpdatedAt: date(value["sourceUpdatedAt"]),
    sourceUrl: url(value["sourceUrl"]), sourceLabel: text(value["sourceLabel"], "Chưa có thông tin nguồn"),
    sourceLicense: text(value["sourceLicense"], "Chưa xác nhận giấy phép"),
    referenceOnly: value["referenceOnly"], photoCredit, photoSource,
    localProfile: parseLocalProfile(value["localProfile"], value["local"]),
    facets: list(value["facets"]).filter(isPlaceFacet),
    mobile: typeof value["mobile"] === "boolean" ? value["mobile"] : undefined,
    reviewCount: integer(value["reviewCount"] ?? 0), rating: number(value["rating"], 1, 5),
  };
}

export interface ApiReview extends Review {
  id: string;
  author: { id: string; name: string };
  photoIds: string[];
  hidden: boolean;
  reply: { text: string; updatedAt: string } | null;
}
export function parseApiReview(input: unknown): ApiReview {
  const value = record(input), author = record(value["author"]);
  const id = text(value["id"]), placeId = text(value["placeId"]), authorId = text(author["id"]);
  const rating = number(value["rating"], 1, 5);
  const visitedOn = text(value["visitedOn"]);
  if (!/^[0-9]+$/.test(id) || !/^[0-9]+$/.test(authorId) || !validPlaceId(placeId) || rating == null ||
      !Number.isInteger(rating) || (visitedOn && !validTripDate(visitedOn))) throw new Error("Đánh giá API không hợp lệ.");
  const photos = list(value["photos"]).map(item => url(item, true));
  const photoIds = list(value["photoIds"]);
  if (photos.length > 3 || photos.length !== photoIds.length || photoIds.some(photo => !/^[0-9]+$/.test(photo))) throw new Error("Ảnh đánh giá API không hợp lệ.");
  let reply: ApiReview["reply"] = null;
  if (value["reply"] != null) {
    const response = record(value["reply"]);
    reply = { text: text(response["text"]), updatedAt: date(response["updatedAt"]) ?? "" };
  }
  return { id, placeId, rating, text: text(value["text"]), visitedOn, photos, photoIds,
    updatedAt: date(value["updatedAt"]) ?? "", author: { id: authorId, name: text(author["name"]) },
    hidden: value["hidden"] === true, reply };
}
export interface PageMeta { current_page: number; last_page: number; per_page: number; total: number; }
function meta(input: unknown): PageMeta {
  const value = record(input);
  const result = { current_page: integer(value["current_page"], 1), last_page: integer(value["last_page"], 1),
    per_page: integer(value["per_page"], 1), total: integer(value["total"]) };
  if (result.per_page > 200 || result.last_page > 1000) throw new Error("Phân trang API vượt giới hạn.");
  return result;
}
export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}
export function csrfCookie(cookie: string): string {
  const value = cookie.split(";").map(item => item.trim()).find(item => item.startsWith("XSRF-TOKEN="));
  try { return value ? decodeURIComponent(value.slice("XSRF-TOKEN=".length)) : ""; } catch { return ""; }
}
export class PlacesApi {
  private readonly fetcher: typeof fetch;
  private readonly cookie: () => string;
  constructor(fetcher: typeof fetch = (...args) => globalThis.fetch(...args), cookie: () => string = () => document.cookie) {
    this.fetcher = fetcher;
    this.cookie = cookie;
  }
  async request(path: string, method = "GET", payload?: unknown, signal?: AbortSignal): Promise<RecordValue> {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (method !== "GET") {
      headers["Content-Type"] = "application/json";
      const token = csrfCookie(this.cookie());
      if (token) headers["X-XSRF-TOKEN"] = token;
    }
    let response: Response;
    try {
      response = await this.fetcher(path, { method, credentials: "same-origin", headers, signal,
        ...(payload === undefined ? {} : { body: JSON.stringify(payload) }) });
    } catch { throw new ApiError(0, "Không kết nối được máy chủ. Hãy thử lại."); }
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const messages: Record<number, string> = { 401: "Hãy đăng nhập để lưu yêu thích và đánh giá.",
        403: "Bạn không có quyền thực hiện thao tác này.", 404: "Không tìm thấy nội dung này.",
        419: "Phiên làm việc đã hết hạn. Hãy tải lại trang rồi thử lại.", 422: "Thông tin chưa hợp lệ. Hãy kiểm tra lại.",
        429: "Bạn thao tác quá nhanh. Hãy thử lại sau." };
      let message = messages[response.status] ?? "Máy chủ chưa xử lý được. Hãy thử lại sau.";
      if (response.status === 422 && body && typeof body === "object" && "errors" in body) {
        const errors = Object.values(record(body.errors)).flat();
        const first = errors.find(item => typeof item === "string");
        if (typeof first === "string") message = first;
      }
      throw new ApiError(response.status, message);
    }
    return record(body);
  }
  private async placesPage(query: URLSearchParams, signal?: AbortSignal) {
    const body = await this.request(`/api/places?${query}`, "GET", undefined, signal);
    if (!Array.isArray(body["data"])) throw new Error("Danh mục API không hợp lệ.");
    return { data: body["data"].map(parseApiPlace), meta: meta(body["meta"]) };
  }
  async suggestions(category: Category, facet?: PlaceFacet, signal?: AbortSignal): Promise<Place[]> {
    const query = new URLSearchParams({ category, has_image: "1", per_page: "8" });
    if (facet) query.set("facet", facet);
    return (await this.placesPage(query, signal)).data;
  }
  async catalog(): Promise<Place[]> {
    const body = await this.request("/api/places/catalog");
    if (!Array.isArray(body["data"])) throw new Error("Danh mục API không hợp lệ.");
    const places = body["data"].map(parseApiPlace);
    if (new Set(places.map(place => place.id)).size !== places.length) {
      throw new Error("Danh mục chứa địa điểm trùng lặp. Hãy thử tải lại.");
    }
    return places;
  }
  async detail(id: string): Promise<Place> {
    return parseApiPlace((await this.request(`/api/places/detail?id=${encodeURIComponent(id)}`))["data"]);
  }
  async favorites(method = "GET", placeId?: string): Promise<string[]> {
    const data = (await this.request("/api/favorites", method, placeId === undefined ? undefined : { placeId }))["data"];
    if (!Array.isArray(data) || data.some(id => !validPlaceId(id))) throw new Error("Danh sách yêu thích API không hợp lệ.");
    return [...new Set(data as string[])];
  }
  async reviews(placeId: string, page = 1) {
    const body = await this.request(`/api/reviews?placeId=${encodeURIComponent(placeId)}&page=${page}`);
    const summary = record(body["summary"]);
    if (!Array.isArray(body["data"])) throw new Error("Danh sách đánh giá API không hợp lệ.");
    return { data: body["data"].map(parseApiReview), meta: meta(body["meta"]),
      summary: { count: integer(summary["count"]), average: number(summary["average"], 1, 5) } };
  }
  async ownReview(placeId: string): Promise<ApiReview | null> {
    const data = (await this.request(`/api/reviews/mine?placeId=${encodeURIComponent(placeId)}`))["data"];
    return data == null ? null : parseApiReview(data);
  }
  async saveReview(review: Review): Promise<ApiReview> {
    const body = await this.request("/api/reviews", "POST", { placeId: review.placeId, rating: review.rating,
      text: review.text, visitedOn: review.visitedOn || null, photos: review.photos });
    return parseApiReview(body["data"]);
  }
  async deleteReview(id: string) { await this.request(`/api/reviews/${encodeURIComponent(id)}`, "DELETE"); }
}
