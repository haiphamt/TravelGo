import { Component, ElementRef, Injector, afterNextRender, computed, inject, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { RouterLink } from "@angular/router";
import { money, Place } from "./data";
import { Icon } from "./icon";
import { normalize, TripSnapshot } from "./logic";
import { WorkflowPlacePicker } from "./proposal-form";
import {
  EMPTY_ROOM_STATE, GroupRoomRecord, ROOM_MEMBER_LIMIT, ROOM_PLACE_LIMIT,
  ROOM_STOP_LIMIT, RoomState, RoomStop, defaultRoomTime, finalizeRoom, saveRoomVotes,
  validRoomDate, validRoomTime, validStopCount,
} from "./room-state";
import { TravelStore } from "./store";
import { placeRevision, tripNeedsReview, tripSnapshot } from "./workflow";

// Dashboard layout from Didaune features/decision at 04597f6, with TravelGo's local room state.
@Component({
  standalone: true,
  imports: [FormsModule, RouterLink, Icon, WorkflowPlacePicker],
  host: { class: "didaune-ui" },
  templateUrl: "./group-room.html",
  styleUrl: "./group-room.css",
})
export class GroupRoom {
  readonly store = inject(TravelStore);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly state = computed(() => this.store.state().roomState ?? EMPTY_ROOM_STATE);
  readonly room = computed(() => this.state().rooms.find(room => room.code === this.state().activeCode));
  readonly roomFilter = signal<"all" | "owner" | "member">("all");
  readonly roomGroups = computed(() => {
    const all = this.state().rooms;
    return {
      all,
      owner: all.filter(room => room.ownerId === room.activeMemberId),
      member: all.filter(room => room.ownerId !== room.activeMemberId),
    };
  });
  readonly roomFilters = [
    { value: "all", label: "Tất cả" },
    { value: "owner", label: "Tôi làm chủ" },
    { value: "member", label: "Đã tham gia" },
  ] as const;
  readonly mode = signal<"create" | "join" | null>(null);
  readonly name = signal("");
  readonly title = signal("");
  readonly date = signal("");
  readonly desiredStops = signal<number | null>(3);
  readonly code = signal("");
  readonly pickedId = signal("");
  readonly busy = signal(false);
  readonly deciding = signal(false);
  readonly editing = signal(false);
  readonly replacing = signal("");
  readonly selectedStops = signal<string[]>([]);
  readonly draftVotes = signal<string[] | null>(null);
  readonly isOwner = computed(() => {
    const room = this.room();
    return !!room && room.ownerId === room.activeMemberId;
  });
  readonly catalogById = computed(() => new Map(this.store.places().map(place => [place.id, place])));
  readonly available = computed(() => new Map([...this.catalogById()].filter(([, place]) =>
    place.city === "hcm" && !place.demoChange?.status).map(([id, place]) => [id, place.name])));
  readonly voterCount = computed(() => new Set(this.room()?.votes.map(vote => vote.memberId)).size);
  readonly savedVotes = computed(() => {
    const room = this.room();
    return room?.votes.filter(vote => vote.memberId === room.activeMemberId).map(vote => vote.placeId) ?? [];
  });
  readonly myVotes = computed(() => this.draftVotes() ?? this.savedVotes());
  readonly votesChanged = computed(() => {
    const saved = this.savedVotes();
    const current = this.myVotes();
    return saved.length !== current.length || saved.some(id => !current.includes(id));
  });
  readonly canSaveVotes = computed(() => this.store.catalogStatus() === "ready" && this.votesChanged() &&
    this.myVotes().every(id => this.available().has(id)));
  readonly choices = computed(() => {
    const room = this.room();
    if (!room) return [];
    const available = this.available();
    return room.places.map(place => ({
      ...place,
      currentName: this.catalogById().get(place.placeId)?.name,
      canVote: available.has(place.placeId),
      votes: room.votes.filter(vote => vote.placeId === place.placeId).length,
      selected: this.myVotes().includes(place.placeId),
    })).sort((a, b) => b.votes - a.votes);
  });
  readonly tied = computed(() => {
    const [first, second] = this.choices().filter(choice => choice.canVote);
    return !!first && !!second && first.votes > 0 && first.votes === second.votes;
  });
  readonly readyToDecide = computed(() => this.choices().some(choice => choice.canVote && choice.votes > 0));
  readonly canOpenVoting = computed(() => this.store.catalogStatus() === "ready" && this.choices().some(choice => choice.canVote));
  readonly canSaveDecision = computed(() => this.selectedStops().length > 0 &&
    this.selectedStops().every(id => this.available().has(id)));
  readonly itinerary = computed(() => this.room()?.itinerary ?? this.room()?.result ?? []);
  readonly changedStops = computed(() => {
    const catalog = this.catalogById();
    return new Map(this.itinerary().flatMap(stop => {
      const place = catalog.get(stop.placeId);
      return place && stop.snapshot && tripNeedsReview(stop.snapshot, place, stop.keptRevision)
        ? [[stop.placeId, tripSnapshot(place)] as const] : [];
    }));
  });
  readonly canCopy = computed(() => this.store.catalogStatus() === "ready" && this.itinerary().length > 0 &&
    this.itinerary().every(stop => this.catalogById().has(stop.placeId)));
  readonly outOfOrder = computed(() => this.itinerary().some((stop, i, stops) => i > 0 && stop.time < stops[i - 1].time));
  readonly placeLimit = ROOM_PLACE_LIMIT;
  readonly stopLimit = ROOM_STOP_LIMIT;

  initiallySelected(room: GroupRoomRecord, placeId: string) {
    return room.result.some(stop => stop.placeId === placeId);
  }

  formatDate(date: string) {
    return date ? date.split("-").reverse().join("/") : "Chưa chọn ngày đi";
  }

  describeSnapshot(snapshot: TripSnapshot) {
    const coordinates = snapshot.lat === null || snapshot.lng === null ? "Chưa có tọa độ"
      : `${snapshot.lat.toFixed(5)}, ${snapshot.lng.toFixed(5)}`;
    const status = snapshot.status === "paused" ? "Tạm nghỉ trong bản thử"
      : snapshot.status === "closed" ? "Ngừng bán trong bản thử" : "";
    return [snapshot.area, coordinates, snapshot.hours || "Chưa có giờ bán", money(snapshot.price ?? null), status].filter(Boolean).join(" · ");
  }

  showForm(mode: "create" | "join", joinCode = this.room()?.code ?? "") {
    this.name.set("");
    this.title.set("");
    this.date.set("");
    this.desiredStops.set(3);
    if (mode === "join") this.code.set(joinCode);
    this.mode.set(mode);
    if (!this.room()) this.focusAfterRender("room-entry-title");
  }

  closeLobbyForm() {
    const mode = this.mode();
    this.mode.set(null);
    this.focusAfterRender(mode === "join" ? "lobby-invite" : "create-room");
  }

  async createRoom() {
    const title = this.title().trim();
    const name = this.name().trim();
    const date = this.date();
    const desiredStops = this.desiredStops();
    if (!title || title.length > 80 || !name || name.length > 40 || !validRoomDate(date) || !validStopCount(desiredStops)) {
      this.store.toast("Kiểm tra tên phòng, tên hiển thị, ngày đi và số điểm mong muốn.");
      return;
    }
    const id = crypto.randomUUID();
    if (await this.persist(state => {
      let code = crypto.randomUUID().slice(0, 8).toUpperCase();
      while (state.rooms.some(room => room.code === code)) code = crypto.randomUUID().slice(0, 8).toUpperCase();
      const room: GroupRoomRecord = {
        code, title, date, desiredStops, votingOpened: false, ownerId: id, activeMemberId: id,
        members: [{ id, name }], places: [], votes: [], result: [],
      };
      return { rooms: [...state.rooms, room], activeCode: code };
    })) {
      this.clearDrafts();
      this.focusAfterRender("room-title");
    }
  }

  async joinRoom() {
    const name = this.name().trim();
    const code = this.code().trim().toUpperCase();
    if (!name || name.length > 40 || !/^[A-F0-9]{8}$/.test(code)) {
      this.store.toast("Nhập mã phòng 8 ký tự và tên hiển thị.");
      return;
    }
    if (await this.changeRoom(code, room => {
      if (room.result.length) return "Phòng đã chốt lịch trình và đóng bình chọn.";
      if (room.members.length >= ROOM_MEMBER_LIMIT) return `Phòng thử hỗ trợ tối đa ${ROOM_MEMBER_LIMIT} thành viên.`;
      if (room.members.some(member => normalize(member.name) === normalize(name))) {
        return "Tên đã có trong phòng. Hãy chọn tên khác hoặc mở phòng đã lưu để đổi vai thử.";
      }
      const id = crypto.randomUUID();
      return { ...room, activeMemberId: id, members: [...room.members, { id, name }] };
    })) {
      this.clearDrafts();
      this.focusAfterRender("room-title");
    }
  }

  async openRoom(code: string) {
    if (await this.persist(state => state.rooms.some(room => room.code === code) ? { ...state, activeCode: code } : null)) {
      this.clearDrafts();
      this.focusAfterRender("room-title");
    }
  }

  async backToRooms() {
    if (await this.persist(state => ({ ...state, activeCode: "" }))) {
      this.clearDrafts();
      this.focusAfterRender("room-lobby-title");
    }
  }

  async switchMember(code: string, id: string) {
    if (await this.changeRoom(code, room => room.members.some(member => member.id === id)
      ? { ...room, activeMemberId: id } : "Không tìm thấy thành viên thử.")) this.clearDrafts();
  }

  async copyCode(code: string, field: HTMLInputElement) {
    try {
      await navigator.clipboard.writeText(code);
      this.store.toast("Đã sao chép mã mời dùng trong trình duyệt này.");
    } catch {
      field.focus();
      field.select();
      this.store.toast("Hãy sao chép mã mời từ ô đã chọn.");
    }
  }

  async suggest(code: string) {
    const placeId = this.pickedId();
    if (await this.changeRoom(code, room => {
      const name = this.available().get(placeId);
      if (!name || this.store.catalogStatus() !== "ready") return "Hãy chọn địa điểm có sẵn trong danh mục.";
      if (room.votingOpened || room.ownerId !== room.activeMemberId) {
        return "Chủ phòng thêm địa điểm trước khi mở bình chọn.";
      }
      if (room.places.some(place => place.placeId === placeId)) return "Địa điểm này đã được đề xuất.";
      if (room.places.length >= ROOM_PLACE_LIMIT) return `Mỗi phòng có tối đa ${ROOM_PLACE_LIMIT} đề xuất.`;
      return { ...room, places: [...room.places, { placeId, name: name.slice(0, 250) }] };
    })) {
      this.pickedId.set("");
      this.store.toast("Đã thêm địa điểm vào danh sách bình chọn.");
    }
  }

  async removeSuggestion(code: string, placeId: string) {
    await this.changeRoom(code, room => room.votingOpened || room.ownerId !== room.activeMemberId
      ? "Chủ phòng bỏ địa điểm trước khi mở bình chọn."
      : { ...room, places: room.places.filter(place => place.placeId !== placeId) });
  }

  async openVoting(code: string) {
    if (await this.changeRoom(code, room => {
      if (room.votingOpened || room.ownerId !== room.activeMemberId) return "Chỉ chủ phòng có thể mở bình chọn một lần.";
      if (this.store.catalogStatus() !== "ready" || !room.places.some(place => this.available().has(place.placeId))) {
        return "Hãy thêm ít nhất một địa điểm có thể bình chọn.";
      }
      return { ...room, votingOpened: true };
    })) {
      this.pickedId.set("");
      this.focusAfterRender("group-voting-title");
      this.store.toast("Đã mở bình chọn cho các thành viên thử.");
    }
  }

  toggleVote(placeId: string) {
    const current = this.myVotes();
    this.draftVotes.set(current.includes(placeId) ? current.filter(id => id !== placeId) : [...current, placeId]);
  }

  async submitVotes(code: string, memberId: string) {
    const ids = this.myVotes();
    if (await this.changeRoom(code, room => {
      if (memberId !== room.activeMemberId || ids.some(id => !this.available().has(id)) || this.store.catalogStatus() !== "ready") {
        return "Địa điểm hoặc vai đang thao tác đã thay đổi. Hãy kiểm tra lại.";
      }
      return saveRoomVotes(room, memberId, ids) ?? "Chỉ có thể lưu phiếu khi phòng đang mở bình chọn.";
    })) {
      this.draftVotes.set(null);
      this.store.toast(ids.length ? "Đã lưu lựa chọn bình chọn của bạn." : "Đã rút các lựa chọn bình chọn của bạn.");
    }
  }

  startDecision() {
    this.selectedStops.set([]);
    this.deciding.set(true);
    this.focusAfterRender("room-decision-title");
  }

  cancelDecision() {
    this.deciding.set(false);
    this.focusAfterRender("group-voting-title");
  }

  toggleStop(id: string) {
    this.selectedStops.update(stops => stops.includes(id) ? stops.filter(stop => stop !== id)
      : stops.length < ROOM_STOP_LIMIT ? [...stops, id] : stops);
  }

  async confirmDecision(code: string, memberId: string) {
    const selected = this.selectedStops();
    if (await this.changeRoom(code, room => {
      const available = this.available();
      if (memberId !== room.activeMemberId || this.store.catalogStatus() !== "ready" ||
          !room.votes.some(vote => available.has(vote.placeId))) return "Cần ít nhất một phiếu ở địa điểm có thể chọn.";
      const finalized = finalizeRoom(room, memberId, selected, available);
      if (!finalized) return "Chỉ chủ phòng mới có thể chốt các địa điểm hợp lệ.";
      return { ...finalized, result: finalized.result.map(stop => ({
        ...stop, snapshot: tripSnapshot(this.catalogById().get(stop.placeId)!),
      })) };
    })) {
      this.clearDrafts();
      this.focusAfterRender("group-itinerary-title");
      this.store.toast("Đã chốt lịch trình nhóm.");
    }
  }

  async copyItinerary(room: GroupRoomRecord) {
    if (this.busy() || !this.canCopy()) return;
    this.busy.set(true);
    try {
      if (await this.store.createTrip({ name: room.title, date: room.date, source: "room", points: this.itinerary().map(stop => ({
        placeId: stop.placeId, time: stop.time, snapshot: stop.snapshot, keptRevision: stop.keptRevision,
      })) }, { preserveSnapshots: true })) this.store.toast("Đã lưu một bản vào Lịch trình của tôi.");
    } finally {
      this.busy.set(false);
    }
  }

  async addItineraryStop(code: string) {
    const placeId = this.pickedId();
    if (await this.updateItinerary(code, stops => {
      const place = this.catalogById().get(placeId);
      if (!place || !this.available().has(placeId) || this.store.catalogStatus() !== "ready") return "Hãy chọn địa điểm có sẵn trong danh mục.";
      if (stops.some(stop => stop.placeId === placeId)) return "Điểm này đã có trong lịch trình nhóm.";
      if (stops.length >= ROOM_STOP_LIMIT) return `Lịch trình nhóm có tối đa ${ROOM_STOP_LIMIT} điểm.`;
      return [...stops, this.newStop(place, defaultRoomTime(stops.length))];
    })) this.pickedId.set("");
  }

  async setItineraryTime(code: string, placeId: string, input: HTMLInputElement) {
    const previous = this.itinerary().find(stop => stop.placeId === placeId)?.time ?? "";
    const time = input.value;
    if (!validRoomTime(time)) {
      input.value = previous;
      this.store.toast("Nhập giờ ghé hợp lệ.");
      return;
    }
    if (!await this.updateItinerary(code, stops => stops.map(stop => stop.placeId === placeId ? { ...stop, time } : stop))) {
      input.value = previous;
    }
  }

  async moveItineraryStop(code: string, placeId: string, offset: number) {
    await this.updateItinerary(code, stops => {
      const index = stops.findIndex(stop => stop.placeId === placeId);
      const next = index + offset;
      if (index < 0 || next < 0 || next >= stops.length) return "Thứ tự điểm ghé đã thay đổi.";
      const reordered = [...stops];
      [reordered[index], reordered[next]] = [reordered[next], reordered[index]];
      return reordered;
    });
  }

  async removeItineraryStop(code: string, placeId: string) {
    await this.updateItinerary(code, stops => stops.length > 1 ? stops.filter(stop => stop.placeId !== placeId)
      : "Giữ ít nhất một điểm trong lịch trình nhóm.");
  }

  toggleEditing() {
    this.editing.update(editing => !editing);
    this.pickedId.set("");
    this.replacing.set("");
  }

  toggleReplacement(placeId: string) {
    this.replacing.update(id => id === placeId ? "" : placeId);
    this.pickedId.set("");
  }

  async resolveStop(code: string, placeId: string, action: "update" | "keep" | "replace") {
    const replacementId = this.pickedId();
    if (await this.updateItinerary(code, stops => {
      const stop = stops.find(item => item.placeId === placeId);
      const current = this.catalogById().get(placeId);
      if (!stop || this.store.catalogStatus() !== "ready") return "Chưa thể mở điểm ghé này để xử lý thay đổi.";
      if (action === "replace") {
        const replacement = this.catalogById().get(replacementId);
        if (!replacement || !this.available().has(replacementId) || stops.some(item => item.placeId === replacementId)) {
          return "Chọn điểm thay thế hợp lệ và chưa có trong lịch trình nhóm.";
        }
        return stops.map(item => item.placeId === placeId ? this.newStop(replacement, stop.time) : item);
      }
      if (!current || !stop.snapshot || !tripNeedsReview(stop.snapshot, current, stop.keptRevision)) {
        return "Không có thay đổi mới để xử lý cho điểm ghé này.";
      }
      return stops.map(item => {
        if (item.placeId !== placeId) return item;
        return action === "keep" ? { ...item, keptRevision: placeRevision(current) ?? undefined } : this.newStop(current, item.time);
      });
    })) {
      this.replacing.set("");
      this.pickedId.set("");
      this.store.toast(action === "keep" ? "Đã giữ thông tin đã lưu." : "Đã cập nhật điểm trong lịch trình nhóm.");
    }
  }

  private focusAfterRender(id: string) {
    afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>(`#${id}`)?.focus(), { injector: this.injector });
  }

  private clearDrafts() {
    this.mode.set(null);
    this.code.set("");
    this.deciding.set(false);
    this.editing.set(false);
    this.replacing.set("");
    this.pickedId.set("");
    this.selectedStops.set([]);
    this.draftVotes.set(null);
  }

  private newStop(place: Place, time: string): RoomStop {
    return { placeId: place.id, name: place.name.slice(0, 250), time, snapshot: tripSnapshot(place) };
  }

  private updateItinerary(code: string, change: (stops: RoomStop[]) => RoomStop[] | string) {
    return this.changeRoom(code, room => {
      if (!room.result.length || room.ownerId !== room.activeMemberId) return "Chỉ chủ phòng có thể chỉnh lịch trình nhóm đã chốt.";
      const itinerary = change(room.itinerary ?? room.result);
      return typeof itinerary === "string" ? itinerary : { ...room, itinerary };
    });
  }

  private changeRoom(code: string, change: (room: GroupRoomRecord) => GroupRoomRecord | string) {
    return this.persist(state => {
      const room = state.rooms.find(item => item.code === code);
      if (!room) return "Không tìm thấy phòng theo mã này trên trình duyệt hiện tại.";
      const next = change(room);
      return typeof next === "string" ? next : {
        activeCode: code, rooms: state.rooms.map(item => item.code === code ? next : item),
      };
    });
  }

  private async persist(change: (state: RoomState) => RoomState | string | null) {
    if (this.busy()) return false;
    this.busy.set(true);
    try {
      return await this.store.update(state => {
        const roomState = change(state.roomState ?? EMPTY_ROOM_STATE);
        if (typeof roomState === "string") {
          this.store.toast(roomState);
          return null;
        }
        return roomState ? { ...state, roomState } : null;
      });
    } finally {
      this.busy.set(false);
    }
  }
}
