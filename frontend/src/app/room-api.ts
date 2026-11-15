import { validTripSnapshot } from "./workflow.ts";
import { restoreRoomState, validStopCount } from "./room-state.ts";
import type { GroupRoomRecord, RoomStop } from "./room-state.ts";

export class RoomApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

function hasSnapshots(stops: unknown[]): boolean {
  return stops.every(stop => !!stop && typeof stop === "object" && validTripSnapshot((stop as RoomStop).snapshot));
}

export function parseApiRoom(value: unknown): GroupRoomRecord {
  const raw = value as Partial<GroupRoomRecord> | null;
  const room = restoreRoomState({ rooms: [value], activeCode: raw?.code })?.rooms[0];
  if (!room || !raw || !Number.isSafeInteger(raw.revision) || raw.revision! < 1 ||
      room.activeMemberId !== raw.activeMemberId || !["preparing", "voting", "finalized"].includes(raw.phase ?? "") ||
      !Array.isArray(raw.members) || raw.members.length !== room.members.length ||
      !Array.isArray(raw.places) || raw.places.length !== room.places.length ||
      !Array.isArray(raw.votes) || raw.votes.length !== room.votes.length ||
      !Array.isArray(raw.result) || raw.result.length !== room.result.length || !hasSnapshots(raw.result) ||
      !validStopCount(raw.desiredStops) || raw.votingOpened !== room.votingOpened ||
      (raw.itinerary != null && (!Array.isArray(raw.itinerary) || raw.itinerary.length === 0 ||
        raw.itinerary.length !== room.itinerary?.length || !hasSnapshots(raw.itinerary))) ||
      (raw.phase === "finalized") !== (room.result.length > 0) ||
      (raw.phase !== "preparing") !== room.votingOpened) {
    throw new RoomApiError(502, "Dữ liệu phòng chưa hợp lệ. Vui lòng tải lại.");
  }
  return { ...room, revision: raw.revision, phase: raw.phase };
}

export class RoomApiClient {
  private csrfReady = false;
  private readonly send: typeof fetch;
  private readonly cookie: () => string;
  constructor(
    send: typeof fetch = globalThis.fetch.bind(globalThis),
    cookie: () => string = () => typeof document === "undefined" ? "" : document.cookie,
  ) { this.send = send; this.cookie = cookie; }

  async list(): Promise<GroupRoomRecord[]> {
    const data = await this.request("", "GET");
    if (!Array.isArray(data)) throw new RoomApiError(502, "Chưa đọc được danh sách phòng.");
    return data.map(parseApiRoom);
  }

  async show(code: string) { return parseApiRoom(await this.request(this.path(code), "GET")); }
  async create(data: { title: string; name: string; date: string; desiredStops: number }) {
    return parseApiRoom(await this.request("", "POST", data));
  }
  async join(code: string, name: string) { return parseApiRoom(await this.request("/join", "POST", { code, name })); }
  async suggest(code: string, placeId: string) { return this.change(code, "/places", "POST", { placeId }); }
  async removeSuggestion(code: string, placeId: string) { return this.change(code, "/places", "DELETE", { placeId }); }
  async openVoting(code: string) { return this.change(code, "/voting", "POST"); }
  async vote(code: string, placeIds: string[]) { return this.change(code, "/votes", "PUT", { placeIds }); }
  async finalize(code: string, placeIds: string[]) { return this.change(code, "/decision", "POST", { placeIds }); }
  async itinerary(room: GroupRoomRecord, stops: RoomStop[]) {
    const previous = room.itinerary ?? room.result;
    return this.change(room.code, "/itinerary", "PUT", {
      revision: room.revision,
      stops: stops.map(stop => ({
        placeId: stop.placeId, time: stop.time,
        refreshSnapshot: stop.snapshot !== previous.find(old => old.placeId === stop.placeId)?.snapshot,
        ...(stop.keptRevision ? { keptRevision: stop.keptRevision } : {}),
      })),
    });
  }

  private path(code: string) {
    if (!/^[A-F0-9]{8}$/.test(code)) throw new RoomApiError(422, "Mã phòng chưa hợp lệ.");
    return "/" + code;
  }
  private async change(code: string, suffix: string, method: string, body?: unknown) {
    return parseApiRoom(await this.request(this.path(code) + suffix, method, body));
  }

  private async request(path: string, method: string, body?: unknown): Promise<unknown> {
    try {
      const headers: Record<string, string> = { Accept: "application/json", "X-Requested-With": "XMLHttpRequest" };
      if (method !== "GET") {
        if (!this.csrfReady) {
          const csrf = await this.send("/api/rooms/csrf", { credentials: "same-origin", headers, signal: AbortSignal.timeout(12000) });
          if (!csrf.ok) throw new RoomApiError(csrf.status, "Chưa mở được phiên làm việc. Vui lòng thử lại.");
          this.csrfReady = true;
        }
        const token = this.cookie().split(";").map(part => part.trim()).find(part => part.startsWith("XSRF-TOKEN="))?.slice(11);
        if (token) headers["X-XSRF-TOKEN"] = decodeURIComponent(token);
        headers["Content-Type"] = "application/json";
      }
      const response = await this.send("/api/rooms" + path, {
        method, headers, credentials: "same-origin", signal: AbortSignal.timeout(12000),
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        if (response.status === 419) this.csrfReady = false;
        if (response.status >= 500) {
          throw new RoomApiError(response.status, "Phòng cùng đi tạm thời chưa phản hồi. Vui lòng thử lại.");
        }
        const error = payload?.errors ? Object.values(payload.errors).flat().find(value => typeof value === "string") : payload?.message;
        throw new RoomApiError(response.status, response.status === 401 ? "Bạn cần đăng nhập để mở Phòng cùng đi."
          : response.status === 419 ? "Phiên làm việc đã hết hạn. Vui lòng thử lại."
          : typeof error === "string" ? error.slice(0, 500) : "Chưa thể cập nhật phòng. Vui lòng thử lại.");
      }
      return payload?.data;
    } catch (error) {
      if (error instanceof RoomApiError) throw error;
      throw new RoomApiError(0, "Chưa kết nối được Phòng cùng đi. Dữ liệu đã lưu vẫn được giữ; vui lòng thử lại.");
    }
  }
}
