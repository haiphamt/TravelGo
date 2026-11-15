import { validateTripDraft, type SavedTrip, type TripDraft, type TripSnapshot } from './logic.ts';
import { validPlaceId } from './trip-storage.ts';
import { validTripSnapshot } from './workflow.ts';

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;
export type SuggestionRequest = {
  needs: string; area: string; count: number; includeLocal: boolean;
  requested: string[]; startDate: string; endDate: string;
};
export type RemotePreview = {
  points: TripDraft['points']; unmatched: string[]; source: 'ai-demo'; notice: string;
};

export class ItineraryApiError extends Error {
  readonly status: number;
  constructor(message: string, status = 0) { super(message); this.status = status; }
}

export function parseSavedItinerary(value: unknown): SavedTrip & { version: number } {
  if (!value || typeof value !== 'object') throw new ItineraryApiError('Dữ liệu lịch trình không hợp lệ.');
  const raw = value as Record<string, unknown>;
  if (typeof raw.id !== 'string' || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(raw.id) ||
      !Number.isSafeInteger(raw.version) || (raw.version as number) < 1 || !Array.isArray(raw.points) ||
      typeof raw.name !== 'string' || typeof raw.date !== 'string' ||
      (raw.endDate != null && typeof raw.endDate !== 'string') ||
      (raw.note != null && typeof raw.note !== 'string') || (raw.cover != null && typeof raw.cover !== 'string') ||
      !['manual', 'ai-demo', 'room'].includes(String(raw.source))) {
    throw new ItineraryApiError('Dữ liệu lịch trình không hợp lệ.');
  }
  const points = raw.points.map((point: Record<string, unknown>) => {
    if (!point || typeof point !== 'object' || !validPlaceId(point.placeId) || typeof point.time !== 'string' ||
        (point.date != null && typeof point.date !== 'string') || (point.note != null && typeof point.note !== 'string') ||
        (point.estimatedCost != null && typeof point.estimatedCost !== 'number') || !validTripSnapshot(point.snapshot as TripSnapshot)) {
      throw new ItineraryApiError('Dữ liệu điểm ghé không hợp lệ.');
    }
    return {
      placeId: point.placeId, time: point.time, date: (point.date || undefined) as string | undefined,
      note: (point.note ?? undefined) as string | undefined,
      estimatedCost: point.estimatedCost as number | null | undefined, snapshot: point.snapshot as TripSnapshot,
    };
  });
  const trip = { ...raw, points } as unknown as SavedTrip & { version: number };
  const error = validateTripDraft(trip);
  if (error) throw new ItineraryApiError(error);
  return trip;
}

export class ItineraryApi {
  private csrf = '';
  private owner: string | null = null;
  private versions = new Map<string, number>();
  private readonly request: Fetcher;
  private readonly base: string;
  constructor(request: Fetcher = (url, init) => globalThis.fetch(url, init), base = '/api/itineraries') { this.request = request; this.base = base; }

  private async json(path: string, method = 'GET', body?: unknown): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await this.request(this.base + path, {
        method, credentials: 'same-origin', signal: controller.signal, cache: 'no-store',
        headers: { Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': this.csrf }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      if (response.status === 204) return null;
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        const validation = response.status === 422 && data?.errors && typeof data.errors === 'object'
          ? Object.values(data.errors).flat().find(value => typeof value === 'string') as string | undefined : undefined;
        const message = response.status === 401 ? 'Bạn cần đăng nhập để lưu và xem lịch trình theo tài khoản.' :
          response.status === 403 ? 'Bạn không có quyền thực hiện thao tác này.' :
          response.status === 419 ? 'Phiên đã hết hạn. Tải lại trang; bản nháp vẫn được giữ.' :
          response.status === 409 ? 'Lịch trình đã được sửa ở nơi khác. Tải lại trước khi lưu tiếp.' :
          validation ?? (typeof data?.message === 'string' ? data.message : 'Chưa kết nối được dịch vụ lịch trình. Bản nháp vẫn được giữ.');
        throw new ItineraryApiError(message, response.status);
      }
      return data;
    } catch (error) {
      if (error instanceof ItineraryApiError) throw error;
      throw new ItineraryApiError('Kết nối bị gián đoạn hoặc hết thời gian chờ. Bản nháp vẫn được giữ.');
    } finally { clearTimeout(timeout); }
  }

  private async session(writing = false) {
    const result = await this.json('/session') as { authenticated: boolean; userId: string | null; csrfToken: string };
    if (!result?.authenticated || typeof result.userId !== 'string' || typeof result.csrfToken !== 'string') {
      this.owner = null; this.csrf = ''; this.versions.clear();
      throw new ItineraryApiError('Bạn cần đăng nhập để lưu và xem lịch trình theo tài khoản.', 401);
    }
    if (writing && result.userId !== this.owner) {
      this.owner = null; this.versions.clear();
      throw new ItineraryApiError('Tài khoản đăng nhập đã thay đổi. Tải lại trang trước khi lưu.', 401);
    }
    this.owner = result.userId; this.csrf = result.csrfToken;
  }

  private saved(value: unknown) {
    const trip = parseSavedItinerary(value);
    this.versions.set(trip.id, trip.version);
    return trip;
  }

  async list(): Promise<SavedTrip[]> {
    await this.session();
    const response = await this.json('') as { data: unknown[] };
    if (!Array.isArray(response?.data)) throw new ItineraryApiError('Danh sách lịch trình không hợp lệ.');
    this.versions.clear();
    return response.data.map(value => this.saved(value));
  }

  async show(id: string): Promise<SavedTrip> {
    await this.session(true);
    const response = await this.json('/' + encodeURIComponent(id)) as { data: unknown };
    return this.saved(response?.data);
  }

  async save(draft: TripDraft, id?: string): Promise<SavedTrip> {
    const error = validateTripDraft(draft);
    if (error) throw new ItineraryApiError(error);
    if (draft.source === 'room') throw new ItineraryApiError('Chưa thể sao chép kết quả phòng lúc này. Bạn có thể tự tạo lịch trình.');
    await this.session(true);
    if (id && !this.versions.has(id)) throw new ItineraryApiError('Tải lại lịch trình trước khi chỉnh sửa.');
    const payload = {
      name: draft.name, date: draft.date, endDate: draft.endDate || null, note: draft.note,
      cover: draft.cover, budget: draft.budget, source: draft.source ?? 'manual',
      ...(id ? { version: this.versions.get(id) } : {}),
      points: draft.points.map(({ placeId, time, date, note, estimatedCost }) => ({ placeId, time, date, note, estimatedCost })),
    };
    const response = await this.json(id ? '/' + encodeURIComponent(id) : '', id ? 'PUT' : 'POST', payload) as { data: unknown };
    return this.saved(response?.data);
  }

  async remove(id: string): Promise<void> {
    await this.session(true);
    await this.json('/' + encodeURIComponent(id), 'DELETE');
    this.versions.delete(id);
  }

  async suggest(input: SuggestionRequest): Promise<RemotePreview> {
    await this.session(true);
    const response = await this.json('/suggestions', 'POST', input) as { data: RemotePreview };
    const data = response?.data;
    if (!data || data.source !== 'ai-demo' || typeof data.notice !== 'string' || !Array.isArray(data.points) ||
        data.points.some(p => !p || typeof p !== 'object' || !validPlaceId(p.placeId) || typeof p.time !== 'string' ||
          (p.date != null && typeof p.date !== 'string')) ||
        !Array.isArray(data.unmatched) || !data.unmatched.every(value => typeof value === 'string')) {
      throw new ItineraryApiError('Kết quả gợi ý không hợp lệ.');
    }
    const draft: TripDraft = { name: 'Xem trước', date: input.startDate, endDate: input.endDate, points: data.points };
    if (validateTripDraft(draft) || data.points.length > input.count || data.points.some(p => !validPlaceId(p.placeId))) throw new ItineraryApiError('Điểm ghé gợi ý không hợp lệ.');
    return data;
  }
}
