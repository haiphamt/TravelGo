import assert from "node:assert/strict";
import test from "node:test";
import { finalizeRoom, restoreRoomState, saveRoomVotes } from "../src/app/room-state.ts";
import type { GroupRoomRecord } from "../src/app/room-state.ts";

test("room votes follow membership and the owner locks ballots independently of itinerary edits", () => {
  const first = "osm:node/1";
  const second = "osm:node/2";
  const room: GroupRoomRecord = {
    code: "AB123456", title: "Kiểm thử phòng", date: "2026-11-09", desiredStops: 2,
    ownerId: "owner", activeMemberId: "guest", votingOpened: false,
    members: [{ id: "owner", name: "Chủ phòng thử" }, { id: "guest", name: "Thành viên thử" }],
    places: [{ placeId: first, name: "Điểm thử A" }, { placeId: second, name: "Điểm thử B" }],
    votes: [], result: [],
  };
  const available = new Map(room.places.map(place => [place.placeId, place.name]));
  assert.equal(saveRoomVotes(room, "guest", [first]), null);
  const open = { ...room, votingOpened: true };
  assert.equal(saveRoomVotes(open, "stranger", [first]), null);
  assert.equal(saveRoomVotes(open, "guest", [first, first]), null);
  const voted = saveRoomVotes(open, "guest", [first])!;
  const changed = saveRoomVotes(voted, "guest", [first, second])!;
  assert.deepEqual(changed.votes, [{ memberId: "guest", placeId: first }, { memberId: "guest", placeId: second }]);
  assert.deepEqual(saveRoomVotes(changed, "guest", [])!.votes, []);
  assert.equal(finalizeRoom(changed, "guest", [first], available), null);
  assert.equal(finalizeRoom(changed, "owner", [first, first], available), null);

  const closed = finalizeRoom(changed, "owner", [second, first], available)!;
  assert.equal(saveRoomVotes(closed, "owner", [first]), null);
  const edited = { ...closed, itinerary: [{ ...closed.result[1], time: "09:15", keptRevision: "source:fixture",
    snapshot: { name: "Điểm thử A", area: "Địa chỉ thử", lat: null, lng: null, hours: null, price: null, status: null } }] };
  const restored = restoreRoomState({ activeCode: room.code, rooms: [edited] })!;
  assert.equal(restored.activeCode, room.code);
  assert.equal(restored.rooms[0].activeMemberId, "guest");
  assert.deepEqual(restored.rooms[0].votes, changed.votes);
  assert.deepEqual(restored.rooms[0].result.map(stop => stop.placeId), [second, first]);
  assert.deepEqual(restored.rooms[0].itinerary, edited.itinerary);
});
