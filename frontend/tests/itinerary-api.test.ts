import test from 'node:test';
import assert from 'node:assert/strict';
import { ItineraryApi, ItineraryApiError, parseSavedItinerary } from '../src/app/itinerary-api.ts';
import { validPlaceId } from '../src/app/trip-storage.ts';

const id = '11111111-1111-4111-8111-111111111111';
const snapshot = { name: 'Demo', area: 'Quận 1', lat: null, lng: null, price: null, hours: null, status: null };
const saved = {
  id, version: 1, name: 'Chuyến đi demo', date: '2026-12-01', endDate: '', note: '', cover: '', budget: null, source: 'manual',
  points: [{ placeId: 'osm:node/123', time: '09:00', date: null, note: null, estimatedCost: 0, snapshot }],
};
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

test('default transport calls fetch with its global browser receiver', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async function (url) {
    assert.equal(this, globalThis);
    return String(url).endsWith('/session') ? json({ authenticated: true, userId: '1', csrfToken: 'csrf' }) : json({ data: [] });
  };
  try { assert.deepEqual(await new ItineraryApi().list(), []); }
  finally { globalThis.fetch = original; }
});

test('API mapping preserves unknown costs, zero, snapshots and all agreed public IDs', () => {
  const trip = parseSavedItinerary(saved);
  assert.equal(trip.budget, null); assert.equal(trip.points[0].estimatedCost, 0);
  assert.equal(trip.points[0].date, undefined); assert.deepEqual(trip.points[0].snapshot, snapshot);
  assert.equal(validPlaceId('tg-place-11111111-1111-4111-8111-111111111111'), true);
  assert.equal(validPlaceId('osm:way/123'), true); assert.equal(validPlaceId('osm:relation/123'), true);
  for (const bad of ['osm:node/123/extra', 'tg-place-------------------------------------']) assert.equal(validPlaceId(bad), false);
  for (const bad of [
    { ...saved, points: [{ ...saved.points[0], time: '24:00' }] },
    { ...saved, points: [saved.points[0], saved.points[0]] },
    { ...saved, points: [{ ...saved.points[0], snapshot: { ...snapshot, lat: 100 } }] },
  ]) assert.throws(() => parseSavedItinerary(bad), ItineraryApiError);
});

test('API writes use session credentials, CSRF and server version, never client snapshots or user IDs', async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const api = new ItineraryApi(async (url, init) => {
    calls.push({ url, init });
    if (url.endsWith('/session')) return json({ authenticated: true, userId: '42', csrfToken: 'test-csrf' });
    if (init?.method === 'GET') return json({ data: [saved] });
    return json({ data: { ...saved, version: 2 } });
  });
  const [trip] = await api.list();
  await api.save(trip, trip.id);
  const write = calls.at(-1)!;
  assert.equal(write.url, '/api/itineraries/' + id); assert.equal(write.init?.method, 'PUT');
  assert.equal(write.init?.credentials, 'same-origin');
  assert.equal((write.init?.headers as Record<string, string>)['X-CSRF-TOKEN'], 'test-csrf');
  const body = JSON.parse(String(write.init?.body));
  assert.equal(body.version, 1); assert.equal(body.userId, undefined); assert.equal(body.points[0].snapshot, undefined);
});

test('a changed account blocks a pending write and a failed request leaves the draft untouched', async () => {
  let owner = '1'; let writes = 0;
  const api = new ItineraryApi(async (url, init) => {
    if (url.endsWith('/session')) return json({ authenticated: true, userId: owner, csrfToken: 'csrf' });
    if (init?.method === 'GET') return json({ data: [saved] });
    writes++; return json({ message: 'failure' }, 500);
  });
  const [trip] = await api.list(); const before = structuredClone(trip);
  await assert.rejects(() => api.save({ ...trip, source: 'room' }), /sao chép kết quả phòng/);
  await assert.rejects(() => api.save(trip), (e: ItineraryApiError) => e.status === 500);
  assert.deepEqual(trip, before);
  owner = '2';
  await assert.rejects(() => api.save(trip), (e: ItineraryApiError) => e.status === 401);
  assert.equal(writes, 1);
});

test('unauthorized, stale edits and offline requests return actionable errors', async () => {
  for (const status of [401, 409]) {
    const api = new ItineraryApi(async url => url.endsWith('/session') ? json({ authenticated: true, userId: '1', csrfToken: 'csrf' }) : json({ message: 'failure' }, status));
    await assert.rejects(() => api.list(), (e: ItineraryApiError) => e.status === status);
  }
  const offline = new ItineraryApi(async () => { throw new TypeError('offline'); });
  await assert.rejects(() => offline.list(), /Bản nháp vẫn được giữ/);
});

test('validation responses identify the field to fix and malformed save responses stay readable', async () => {
  let malformed = false;
  const api = new ItineraryApi(async (url, init) => {
    if (url.endsWith('/session')) return json({ authenticated: true, userId: '1', csrfToken: 'csrf' });
    if (init?.method === 'GET') return json({ data: [] });
    return malformed ? json(null) : json({ message: 'Validation failed', errors: { 'points.0.placeId': ['Địa điểm không tồn tại trong danh mục TravelGo.'] } }, 422);
  });
  await api.list();
  const draft = { ...parseSavedItinerary(saved) };
  await assert.rejects(() => api.save(draft), /Địa điểm không tồn tại/);
  malformed = true;
  await assert.rejects(() => api.save(draft), (error: ItineraryApiError) => error instanceof ItineraryApiError && /Dữ liệu lịch trình/.test(error.message));
});

test('suggestions only request preview and reject malformed, duplicate or out-of-range points', async () => {
  const calls: string[] = []; let points: unknown = [{ placeId: 'osm:node/123', time: '09:00', date: '2026-12-01' }];
  const api = new ItineraryApi(async (url, init) => {
    calls.push(url);
    if (url.endsWith('/session')) return json({ authenticated: true, userId: '1', csrfToken: 'csrf' });
    if (init?.method === 'GET') return json({ data: [] });
    return json({ data: { points, unmatched: [], source: 'ai-demo', notice: 'Gợi ý mô phỏng' } });
  });
  await api.list();
  const input = { needs: 'cà phê', area: '', includeLocal: false, requested: [], count: 2, startDate: '2026-12-01', endDate: '2026-12-01' };
  const preview = await api.suggest(input); assert.equal(preview.points.length, 1);
  assert.equal(calls.at(-1), '/api/itineraries/suggestions');
  for (const bad of [[null], [preview.points[0], preview.points[0]], [{ ...preview.points[0], date: '2027-01-01' }]]) {
    points = bad; await assert.rejects(() => api.suggest(input), ItineraryApiError);
  }
});

test('room copying sends only a source reference, uses CSRF and keeps the verified snapshot and acknowledgement', async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const copy = { ...saved, source: 'room', name: '😀'.repeat(80), points: [{ ...saved.points[0], keptRevision: 'source:reviewed' }] };
  const api = new ItineraryApi(async (url, init) => {
    calls.push({ url, init });
    if (url.endsWith('/session')) return json({ authenticated: true, userId: '42', csrfToken: 'csrf-copy' });
    if (init?.method === 'GET') return json({ data: [] });
    return json({ data: copy });
  });
  await api.list();
  const trip = await api.copyRoom('AB123456', 7, '42');
  const write = calls.at(-1)!;
  assert.equal(write.url, '/api/itineraries/from-room');
  assert.equal(write.init?.method, 'POST');
  assert.deepEqual(JSON.parse(String(write.init?.body)), { roomCode: 'AB123456', roomRevision: 7 });
  assert.equal((write.init?.headers as Record<string, string>)['X-CSRF-TOKEN'], 'csrf-copy');
  assert.deepEqual(trip.points[0].snapshot, snapshot);
  assert.equal(trip.points[0].keptRevision, 'source:reviewed');
  await api.save(trip, trip.id);
  assert.equal(calls.at(-1)!.url, '/api/itineraries/' + trip.id);
  assert.equal(JSON.parse(String(calls.at(-1)!.init?.body)).source, 'room');
});

test('room copying blocks invalid references, changed accounts and old room actors before writing', async () => {
  let owner = '1'; let writes = 0;
  const api = new ItineraryApi(async (url, init) => {
    if (url.endsWith('/session')) return json({ authenticated: true, userId: owner, csrfToken: 'csrf' });
    if (init?.method === 'GET') return json({ data: [] });
    writes++; return json({ data: saved });
  });
  await api.list();
  await assert.rejects(() => api.copyRoom('../bad', 1, '1'), ItineraryApiError);
  await assert.rejects(() => api.copyRoom('AB123456', 0, '1'), ItineraryApiError);
  await assert.rejects(() => api.copyRoom('AB123456', 1, '2'), (e: ItineraryApiError) => e.status === 401);
  owner = '2';
  await assert.rejects(() => api.copyRoom('AB123456', 1, '1'), (e: ItineraryApiError) => e.status === 401);
  assert.equal(writes, 0);
});

test('stale room responses request a room reload and a lost response can be retried without changing the source', async () => {
  let status = 409;
  const bodies: unknown[] = [];
  const api = new ItineraryApi(async (url, init) => {
    if (url.endsWith('/session')) return json({ authenticated: true, userId: '1', csrfToken: 'csrf' });
    if (init?.method === 'GET') return json({ data: [] });
    bodies.push(JSON.parse(String(init?.body)));
    if (status === 0) throw new TypeError('lost response');
    return status === 200 ? json({ data: { ...saved, source: 'room' } }) : json({}, status);
  });
  await api.list();
  await assert.rejects(() => api.copyRoom('AB123456', 5, '1'), /Tải lại phòng/);
  status = 0;
  await assert.rejects(() => api.copyRoom('AB123456', 5, '1'), /Kết nối bị gián đoạn/);
  status = 200;
  assert.equal((await api.copyRoom('AB123456', 5, '1')).source, 'room');
  assert.deepEqual(bodies, Array(3).fill({ roomCode: 'AB123456', roomRevision: 5 }));
});
