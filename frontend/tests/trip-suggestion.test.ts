import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseCatalog } from "../src/app/catalog.ts";
import { suggestTrip } from "../src/app/trip-suggestion.ts";

const places = parseCatalog(JSON.parse(readFileSync(new URL("../public/data/catalog.json", import.meta.url), "utf8")));
const input = { needs: "Ăn uống và đi dạo công viên", area: "", count: 3, includeLocal: true };

test("itinerary suggestions respect catalog categories, place status, area and Local preference", () => {
  const result = suggestTrip(places, input);
  assert.equal(result.length, 3);
  assert.equal(result.filter(place => place.local).length, 1);
  assert.ok(result.some(place => place.category === "nature"));
  assert.ok(result.every(place => places.includes(place) && place.price === null));

  const [local] = suggestTrip(places, { ...input, needs: "Bánh cam", area: "Chánh Hưng", count: 1 });
  assert.ok(local?.local);
  assert.match(local.name, /Bánh Cam/i);
  assert.deepEqual(suggestTrip([local], { ...input, includeLocal: false }), []);
  assert.deepEqual(suggestTrip([{ ...local, demoChange: { status: "paused", revision: "test", kind: "pause", effectiveFrom: "", effectiveUntil: null, fields: [] } }], input), []);
  assert.deepEqual(suggestTrip(places, { ...input, area: "Khu vực không có trong danh mục" }), []);
});
