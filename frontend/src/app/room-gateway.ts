import { Injectable, InjectionToken, computed, inject, signal } from "@angular/core";
import { RoomApiClient, RoomApiError } from "./room-api";
import type { GroupRoomRecord } from "./room-state";

// Override only for the standalone prototype, never as a fallback after an API error.
export const REMOTE_ROOMS = new InjectionToken<boolean>("REMOTE_ROOMS", { factory: () => true });

@Injectable()
export class RoomGateway {
  readonly enabled = inject(REMOTE_ROOMS);
  readonly api = new RoomApiClient();
  readonly rooms = signal<GroupRoomRecord[]>([]);
  readonly activeCode = signal("");
  readonly loaded = signal(false);
  readonly error = signal("");
  readonly state = computed(() => ({ rooms: this.rooms(), activeCode: this.activeCode() }));
  private generation = 0;
  private loading = false;
  private pending = 0;

  async load() {
    if (!this.enabled || this.loading || this.pending) return;
    this.loading = true;
    const generation = this.generation;
    try {
      const rooms = await this.api.list();
      if (generation !== this.generation) return;
      this.rooms.set(rooms);
      if (!rooms.some(room => room.code === this.activeCode())) this.activeCode.set("");
      this.error.set("");
    } catch (error) {
      if (generation !== this.generation) return;
      this.handleError(error);
    } finally {
      this.loaded.set(true);
      this.loading = false;
    }
  }

  async mutate(action: () => Promise<GroupRoomRecord>) {
    this.pending++;
    this.generation++;
    try {
      const room = await action();
      this.rooms.update(rooms => {
        const existing = rooms.find(old => old.code === room.code);
        if (existing && existing.activeMemberId === room.activeMemberId && existing.revision! > room.revision!) return rooms;
        return existing ? rooms.map(old => old.code === room.code ? room : old) : [room, ...rooms];
      });
      this.activeCode.set(room.code);
      this.error.set("");
      return room;
    } catch (error) {
      this.handleError(error);
      throw error;
    } finally { this.pending--; }
  }

  private handleError(error: unknown) {
    this.error.set(error instanceof Error ? error.message : "Chưa thể đọc dữ liệu phòng.");
    if (error instanceof RoomApiError && (error.status === 401 || error.status === 403)) {
      this.rooms.set([]);
      this.activeCode.set("");
    }
  }
}
