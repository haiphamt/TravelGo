import assert from "node:assert/strict";
import test from "node:test";
import { EMPTY_STATE, orderTripDays, validateTripDraft, type SavedTrip } from "../src/app/logic.ts";
import { activateTrip, restoreTripFields } from "../src/app/trip-storage.ts";

const legacyPoint = { placeId: "osm:node/12", time: "09:00" };
const secondDay = { placeId: "osm:node/14", time: "08:00", date: "2026-11-22", note: "Ghé trước bữa trưa", estimatedCost: 0 };
const plan: SavedTrip = {
  id: "plan-a",
  name: "Cuối tuần",
  date: "2026-11-21",
  endDate: "2026-11-22",
  budget: 150000,
  cover: "data:image/png;base64,iVBORw0KGgo=",
  source: "ai-demo",
  note: "Đi cùng bạn",
  points: [legacyPoint, secondDay],
};

test("creating and switching a saved trip preserves the legacy plan and added itinerary fields", () => {
  const legacy = { ...EMPTY_STATE, trip: [legacyPoint], tripName: "Đi dạo" };
  const created = activateTrip(legacy, plan);
  const restored = { ...created, ...restoreTripFields(structuredClone(created)) };
  assert.equal(restored.tripId, plan.id);
  assert.equal(restored.tripBudget, 150000);
  assert.equal(restored.tripCover, plan.cover);
  assert.equal(restored.tripSource, plan.source);
  assert.equal(restored.tripNote, "Đi cùng bạn");
  assert.equal(restored.trip[1].date, secondDay.date);
  assert.equal(restored.trip[1].note, secondDay.note);
  assert.equal(restored.trip[1].estimatedCost, 0);
  assert.equal(restored.savedTrips[0].name, "Đi dạo");
  const switched = activateTrip(restored, restored.savedTrips[0]);
  assert.equal(switched.trip[0].placeId, legacyPoint.placeId);
  assert.equal(switched.savedTrips?.[0].id, plan.id);
  assert.equal(switched.savedTrips?.[0].cover, plan.cover);
  assert.equal(switched.savedTrips?.length, 1);
});

test("itinerary validation rejects invalid dates, duplicate stops and invalid budgets", () => {
  assert.equal(validateTripDraft(plan), "");
  assert.match(validateTripDraft({ ...plan, endDate: "2026-11-20" }), /ngày kết thúc/);
  assert.match(validateTripDraft({ ...plan, endDate: "2026-11-21" }), /Ngày ghé/);
  assert.match(validateTripDraft({ ...plan, points: [legacyPoint, legacyPoint] }), /một lần/);
  assert.match(validateTripDraft({ ...plan, budget: -10000 }), /ngân sách/);
  assert.match(validateTripDraft({ ...plan, cover: "https://example.com/cover.png" }), /ảnh bìa/);
  assert.match(validateTripDraft({ ...plan, points: [{ ...legacyPoint, estimatedCost: -1 }] }), /dự trù từng điểm/);
});

test("date ordering groups stops by day while retaining custom order within the day", () => {
  const laterTime = { placeId: "osm:way/15", time: "13:00" };
  assert.deepEqual(orderTripDays([secondDay, laterTime, legacyPoint], plan.date), [laterTime, legacyPoint, secondDay]);
});
