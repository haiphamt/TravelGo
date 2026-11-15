import type { Place } from "./data.ts";
import type { Review } from "./logic.ts";
import type { WorkflowRequest } from "./workflow.ts";

export interface ServerReview extends Review {
  id: string;
  photoIds: string[];
  reply: { text: string; updatedAt: string } | null;
}
export interface ServerWorkflowRequest extends WorkflowRequest {
  version: number;
  reviewId?: string;
  photoId?: string;
  currentReview?: ServerReview | null;
}
export interface ModerationSession { id: string; admin: boolean }
interface Page<T> { data: T[]; meta: { current_page: number; last_page: number } }

export class ModerationError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}

export function csrfToken(cookies: string): string {
  const value = cookies.split(";").map(part => part.trim()).find(part => part.startsWith("XSRF-TOKEN="));
  try { return value ? decodeURIComponent(value.slice("XSRF-TOKEN=".length)) : ""; }
  catch { return ""; }
}

export class ModerationClient {
  private fetcher: typeof fetch;
  constructor(fetcher: typeof fetch = fetch) { this.fetcher = fetcher.bind(globalThis); }

  async request<T>(path: string, method = "GET", body?: unknown): Promise<T> {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (method !== "GET") {
      headers["Content-Type"] = "application/json";
      headers["X-XSRF-TOKEN"] = csrfToken(typeof document === "undefined" ? "" : document.cookie);
    }
    let response: Response;
    try {
      response = await this.fetcher(`/api/${path}`, { method, credentials: "same-origin", headers, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch {
      throw new ModerationError("Không kết nối được máy chủ. Dữ liệu chưa được lưu.", 0);
    }
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const errors = data?.errors && typeof data.errors === "object" ? Object.values(data.errors).flat().join(" ") : "";
      throw new ModerationError(errors || data?.message || `Yêu cầu thất bại (HTTP ${response.status}).`, response.status);
    }
    if (!data || typeof data !== "object" || !("data" in data)) throw new ModerationError("Phản hồi máy chủ không hợp lệ.", response.status);
    return data as T;
  }

  async session() { return (await this.request<{ data: ModerationSession }>("moderation/session")).data; }

  async requests(admin: boolean): Promise<ServerWorkflowRequest[]> {
    const entries: ServerWorkflowRequest[] = [];
    for (let page = 1; ; page++) {
      const result = await this.request<Page<ServerWorkflowRequest>>(`${admin ? "moderation/queue" : "contributions"}?per_page=50&page=${page}`);
      if (!Array.isArray(result.data) || result.meta?.current_page !== page || !Number.isInteger(result.meta.last_page) || result.meta.last_page < page) {
        throw new ModerationError("Phân trang máy chủ không hợp lệ.", 200);
      }
      entries.push(...result.data);
      if (page === result.meta.last_page) return entries;
    }
  }

  async place(id: string): Promise<Place> {
    return (await this.request<{ data: Place }>(`moderation/place?id=${encodeURIComponent(id)}`)).data;
  }

  async reviews(id: string): Promise<ServerReview[]> {
    return (await this.request<{ data: ServerReview[] }>(`moderation/reviews?placeId=${encodeURIComponent(id)}`)).data;
  }
}
