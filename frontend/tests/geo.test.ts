import test from "node:test";
import assert from "node:assert/strict";
import { groupMapPoints, hasCoordinates, nearbyMapPoints } from "../src/app/geo.ts";
import { mapsLink } from "../src/app/logic.ts";

test("missing and malformed coordinates never become an outbound directions point", () => {
  assert.equal(hasCoordinates({lat: null, lng: 106.7}), false);
  assert.equal(hasCoordinates({lat: NaN, lng: 106.7}), false);
  assert.equal(hasCoordinates({lat: 91, lng: 106.7}), false);
  assert.equal(hasCoordinates({lat: 0, lng: 0}), true);
  assert.equal(mapsLink([{lat: 10.77, lng: 106.7}, {lat: null, lng: null}]), "");
  assert.equal(mapsLink([{lat: 10.77, lng: Infinity}]), "");
});
test("marker grouping preserves every ID, bounds dense points and resolves distant points on zoom", () => {
  const points = Array.from({length: 7511}, (_, id) => ({id, lat: 10.77 + id % 50 / 10000, lng: 106.7 + id % 70 / 10000}));
  const coarse = groupMapPoints(points, 12);
  assert.ok(coarse.length < 20);
  assert.equal(coarse.reduce((sum, group) => sum + group.places.length, 0), points.length);
  assert.equal(new Set(coarse.flatMap(group => group.places.map(place => place.id))).size, points.length);
  assert.ok(groupMapPoints(points, 19).length > coarse.length);
  assert.equal(groupMapPoints([{lat:10.77,lng:106.7},{lat:10.77,lng:106.7}], 19)[0].places.length, 2);
  assert.deepEqual(groupMapPoints([],12),[]);
});

test("nearby map results use a 5 km radius and keep only valid coordinates", () => {
  const center = {lat: 10.7769, lng: 106.7009};
  const points = [
    {id: "center", ...center},
    {id: "inside", lat: center.lat, lng: center.lng + 0.045},
    {id: "outside", lat: center.lat, lng: center.lng + 0.046},
    {id: "diagonal-outside", lat: center.lat + 0.034, lng: center.lng + 0.034},
    {id: "missing", lat: null, lng: center.lng},
  ];
  assert.deepEqual(nearbyMapPoints(points, center).map(point => point.id), ["center", "inside"]);
});
