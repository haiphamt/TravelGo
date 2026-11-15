import assert from "node:assert/strict";
import test from "node:test";
import { RoomApiClient, RoomApiError, parseApiRoom } from "../src/app/room-api.ts";

const room = {
  code: "AB123456", title: "TravelGo Demo", date: "", desiredStops: 3, ownerId: "1", activeMemberId: "2",
  members: [{ id: "1", name: "Owner" }, { id: "2", name: "Member" }],
  places: [{ placeId: "osm:node/123", name: "Place" }], votes: [], result: [],
  votingOpened: true, phase: "voting", revision: 3,
};

test("API room parsing keeps the authenticated identity and rejects malformed or inconsistent responses", () => {
  assert.equal(parseApiRoom(room).activeMemberId, "2");
  assert.equal(parseApiRoom(room).revision, 3);
  for (const malformed of [null, {}, { ...room, activeMemberId: "intruder" }, { ...room, revision: 0 },
    { ...room, phase: "finalized" }, { ...room, votingOpened: false }]) {
    assert.throws(() => parseApiRoom(malformed), RoomApiError);
  }
});

test("ballots use JSON public IDs, cookies and CSRF without sending a client-chosen member", async () => {
  const calls: { url: string; options: RequestInit }[] = [];
  const send = (async (url: string | URL | Request, options: RequestInit = {}) => {
    calls.push({ url: String(url), options });
    return String(url).endsWith("/csrf") ? new Response(null, { status: 204 }) : Response.json({ data: room });
  }) as typeof fetch;
  const client = new RoomApiClient(send, () => "other=x; XSRF-TOKEN=encoded%3Dtoken");
  await client.vote(room.code, ["osm:node/123"]);
  await client.vote(room.code, []);
  assert.equal(calls.length, 3);
  assert.equal(calls[0].url, "/api/rooms/csrf");
  assert.equal(calls[1].url, "/api/rooms/AB123456/votes");
  assert.equal(calls[1].options.credentials, "same-origin");
  assert.equal(new Headers(calls[1].options.headers).get("X-XSRF-TOKEN"), "encoded=token");
  assert.deepEqual(JSON.parse(calls[1].options.body as string), { placeIds: ["osm:node/123"] });
  assert.deepEqual(JSON.parse(calls[2].options.body as string), { placeIds: [] });
});

test("session errors are reported without silently creating local rooms", async () => {
  const client = new RoomApiClient((async () => Response.json({ message: "Unauthenticated" }, { status: 401 })) as typeof fetch);
  await assert.rejects(client.list(), (error: unknown) => error instanceof RoomApiError && error.status === 401);
});

test("expired CSRF is refreshed on the next attempt and validation errors stay readable", async () => {
  let csrfCalls = 0;
  let attempts = 0;
  const client = new RoomApiClient((async (url: string | URL | Request) => {
    if (String(url).endsWith("/csrf")) { csrfCalls++; return new Response(null, { status: 204 }); }
    attempts++;
    return attempts === 1 ? Response.json({}, { status: 419 })
      : Response.json({ errors: { placeIds: ["Địa điểm chưa hợp lệ."] } }, { status: 422 });
  }) as typeof fetch);
  await assert.rejects(client.vote(room.code, []), (error: unknown) => error instanceof RoomApiError && error.status === 419);
  await assert.rejects(client.vote(room.code, []), /Địa điểm chưa hợp lệ/);
  assert.equal(csrfCalls, 2);
});

test("network failures preserve a useful error and invalid codes never become URL paths", async () => {
  let calls = 0;
  const client = new RoomApiClient((async () => { calls++; throw new TypeError("offline"); }) as typeof fetch);
  await assert.rejects(client.show("../places"), RoomApiError);
  assert.equal(calls, 0);
  await assert.rejects(client.list(), /Chưa kết nối/);
});

test("itinerary updates carry the revision and omit client snapshot and identity fields", async () => {
  let body: Record<string, unknown> = {};
  const client = new RoomApiClient((async (url: string | URL | Request, options: RequestInit = {}) => {
    if (String(url).endsWith("/csrf")) return new Response(null, { status: 204 });
    body = JSON.parse(options.body as string);
    return Response.json({ data: room });
  }) as typeof fetch);
  await client.itinerary(parseApiRoom(room), [{ placeId: "osm:node/123", name: "Untrusted", time: "09:00" }]);
  assert.equal(body["revision"], 3);
  assert.deepEqual(body["stops"], [{ placeId: "osm:node/123", time: "09:00", refreshSnapshot: false }]);
});

test("invalid API itinerary data is rejected instead of silently reverting to the original decision", () => {
  const stop = { placeId: "osm:node/123", name: "Place", time: "08:00",
    snapshot: { name: "Place", area: "Unknown", lat: null, lng: null, hours: null, price: null, status: null } };
  const closed = { ...room, phase: "finalized", result: [stop], itinerary: [stop] };
  assert.equal(parseApiRoom(closed).itinerary?.length, 1);
  for (const invalid of [{ first: stop }, [{ ...stop, time: "25:00" }], [], [stop, stop],
    [{ ...stop, snapshot: { ...stop.snapshot, lat: 999 } }]]) {
    assert.throws(() => parseApiRoom({ ...closed, itinerary: invalid }), RoomApiError);
  }
  assert.throws(() => parseApiRoom({ ...room, desiredStops: 99 }), RoomApiError);
});

test("server failures do not expose SQL or debug details in the room error message", async () => {
  const client = new RoomApiClient((async () => Response.json({ message: "SQLSTATE private server details" }, { status: 500 })) as typeof fetch);
  await assert.rejects(client.list(), (error: unknown) => error instanceof RoomApiError &&
    error.status === 500 && !error.message.includes("SQLSTATE"));
});

test("room labels use the same Unicode character limits as the PHP API", () => {
  const members = room.members.map(member => ({ ...member, name: '😀'.repeat(40) }));
  assert.equal(parseApiRoom({ ...room, title: '😀'.repeat(80), members }).members.length, 2);
  assert.throws(() => parseApiRoom({ ...room, members: [{ ...members[0], name: '😀'.repeat(41) }, members[1]] }), RoomApiError);
});