import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_FILE_BYTES,
  appendTripPoint,
  removeTripPoint,
  setTripTime,
  swapTripPoints,
  mapsLink,
  normalize,
  upsertReview,
  validatePhoto,
  validateReview,
} from "../src/app/logic.ts";
import type { TripItem } from "../src/app/logic.ts";

test("queued additions preserve uniqueness, same-city and five-stop boundaries", async () => {
  const places = Array.from({ length: 6 }, (_, i) => ({
    id: String(i),
    city: "hcm",
  }));
  places.push({ id: "other", city: "dalat" });
  let trip: TripItem[] = [];
  let queue = Promise.resolve();
  const add = (id: string) => {
    queue = queue.then(() => {
      const result = appendTripPoint(trip, id, places);
      if (typeof result !== "string") trip = result;
    });
    return queue;
  };
  await Promise.all([add("0"), add("0"), add("other")]);
  assert.deepEqual(
    trip.map((item) => item.placeId),
    ["0"],
  );
  await Promise.all([add("1"), add("2"), add("3"), add("4"), add("5")]);
  assert.equal(trip.length, 5);
  assert.equal(new Set(trip.map((item) => item.placeId)).size, 5);
  assert.ok(typeof appendTripPoint(trip, "missing", places) === "string");
});

test("review boundary rejects absent/invalid stars, impossible/future dates and too many photos", () => {
  const valid = {
    rating: 5,
    text: "Món ăn hợp vị",
    photos: [],
    visitedOn: "2026-10-17",
  };
  assert.equal(validateReview(valid, "2026-10-18"), "");
  for (const rating of [0, 6, 4.5, NaN])
    assert.ok(validateReview({ ...valid, rating }));
  for (const visitedOn of [
    "2026-10-19",
    "2026-02-30",
    "2026-99-99",
    "yesterday",
  ])
    assert.ok(validateReview({ ...valid, visitedOn }, "2026-10-18"));
  assert.ok(validateReview({ ...valid, text: "a".repeat(501) }));
  assert.ok(validateReview({ ...valid, photos: ["a", "b", "c", "d"] }));
});
test("photo boundary rejects unsupported, empty, oversize and fourth photo", () => {
  assert.equal(
    validatePhoto({ type: "image/jpeg", size: MAX_FILE_BYTES }, 2),
    "",
  );
  assert.ok(validatePhoto({ type: "image/svg+xml", size: 50 }, 0));
  assert.ok(validatePhoto({ type: "image/jpeg", size: 0 }, 0));
  assert.ok(validatePhoto({ type: "image/png", size: MAX_FILE_BYTES + 1 }, 0));
  assert.ok(validatePhoto({ type: "image/webp", size: 50 }, 3));
});
test("editing replaces own review instead of adding rating votes", () => {
  const initial = {
    placeId: "one",
    rating: 5,
    text: "",
    photos: [],
    visitedOn: "",
    updatedAt: "2026-10-18",
  };
  const edited = upsertReview([initial, { ...initial, placeId: "two" }], {
    ...initial,
    rating: 3,
  });
  assert.equal(edited.length, 2);
  assert.equal(edited.find((x) => x.placeId === "one")!.rating, 3);
  assert.equal(edited.find((x) => x.placeId === "two")!.rating, 5);
});
test("accent-insensitive Vietnamese search and ordered outbound Maps link", () => {
  assert.equal(normalize("  Đà Lạt  "), "da lat");
  const url = new URL(
    mapsLink([
      { lat: 10, lng: 106 },
      { lat: 11, lng: 107 },
      { lat: 12, lng: 108 },
    ]),
  );
  assert.equal(url.searchParams.get("origin"), "10,106");
  assert.equal(url.searchParams.get("waypoints"), "11,107");
  assert.equal(url.searchParams.get("destination"), "12,108");
  assert.equal(mapsLink([]), "");
});


test("unresolved saved refs do not redirect visible time edits, reordering, addition or removal", () => {
  const catalog = [
    { id: "visibleB", city: "hcm" },
    { id: "visibleC", city: "hcm" },
    { id: "newD", city: "hcm" },
    { id: "otherCity", city: "dalat" },
  ];
  const original: TripItem[] = [
    { placeId: "missingA", time: "08:00" },
    { placeId: "visibleB", time: "10:00" },
    { placeId: "visibleC", time: "12:00" },
  ];
  let trip = setTripTime(original, "visibleB", "11:15");
  assert.deepEqual(trip.map((item) => item.time), ["08:00", "11:15", "12:00"]);
  assert.equal(original[1].time, "10:00");
  trip = swapTripPoints(trip, "visibleC", "visibleB");
  assert.deepEqual(trip.map((item) => item.placeId), ["missingA", "visibleC", "visibleB"]);
  assert.deepEqual(trip[0], original[0]);
  const added = appendTripPoint(trip, "newD", catalog);
  assert.ok(Array.isArray(added));
  assert.deepEqual(added.map((item) => item.placeId), ["missingA", "visibleC", "visibleB", "newD"]);
  const removed = removeTripPoint(added, "missingA");
  assert.deepEqual(removed.map((item) => item.placeId), ["visibleC", "visibleB", "newD"]);
  assert.deepEqual(added[0], original[0]);
  assert.equal(typeof appendTripPoint(trip, "otherCity", catalog), "string");
  assert.equal(typeof appendTripPoint([
    original[0], { placeId: "otherCity", time: "09:00" }, original[1],
  ], "newD", catalog), "string");
});

test("reorder across an unresolved middle ref preserves it and ignores stale neighbor IDs", () => {
  const trip: TripItem[] = [
    { placeId: "visibleB", time: "08:00" },
    { placeId: "missingA", time: "09:00" },
    { placeId: "visibleC", time: "10:00" },
  ];
  assert.deepEqual(swapTripPoints(trip, "visibleC", "visibleB"), [trip[2], trip[1], trip[0]]);
  assert.deepEqual(swapTripPoints(trip, "visibleC", "removed-neighbor"), trip);
  assert.deepEqual(setTripTime(trip, "removed-neighbor", "11:30"), trip);
});
