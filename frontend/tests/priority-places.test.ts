import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { priorityPlaces } from "../src/app/priority-places.ts";

test("the priority review contains 250 distinct existing food businesses and preserves the Local selection", () => {
  const catalog = JSON.parse(readFileSync(new URL("../public/data/catalog.json", import.meta.url), "utf8"));
  const byId = new Map(catalog.places.map((place: { id: string }) => [place.id, place]));
  assert.equal(priorityPlaces.length, 250);
  assert.equal(new Set(priorityPlaces.map(entry => entry.id)).size, 250);
  let localCount = 0;
  for (const entry of priorityPlaces) {
    const place = byId.get(entry.id) as { local: boolean; category: string } | undefined;
    assert.ok(place, entry.id);
    assert.ok(["food", "coffee", "drink"].includes(place.category));
    assert.ok(entry.group.trim());
    if (place.local) localCount += 1;
  }
  assert.equal(localCount, 50);
});
