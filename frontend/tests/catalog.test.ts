import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { parseCatalog } from "../src/app/catalog.ts";
import { money } from "../src/app/data.ts";
const snapshot = JSON.parse(readFileSync(new URL("../public/data/catalog.json", import.meta.url), "utf8"));
const osmPhotos = JSON.parse(readFileSync(new URL("../public/data/osm-photo-sources.json", import.meta.url), "utf8"));

test("HCM catalog preserves source IDs and missing prices without invented photos or ratings", () => {
  const places = parseCatalog(snapshot);
  assert.equal(places.length, 7507);
  const ids = new Set(places.map((place) => place.id));
  assert.equal(ids.size, places.length);
  for (const excluded of ["osm:way/341504305", "osm:way/1396268967", "osm:way/1152451319", "osm:way/1429659961"])
    assert.ok(!ids.has(excluded), `Excluded place ${excluded} must stay out of the discovery catalog`);
  assert.equal(places.filter((place) => place.local).length, 50);
  assert.equal(places.filter((place) => !place.local).length, 7457);
  assert.ok(places.every((place) => place.city === "hcm" && place.price === null));
  assert.ok(places.filter((place) => !place.local).every((place) => place.sourceLicense === "ODbL-1.0"));
  assert.equal(places.filter((place) => place.local).reduce((sum, place) => sum + place.images.length, 0), 0);
  for (const place of places.filter((place) => place.local)) {
    assert.match(place.id, /^tg-local-/);
    assert.match(place.sourceLicense, /Chưa xác nhận/);
    assert.equal(place.referenceOnly, true);
    assert.equal(place.image, null);
    assert.deepEqual(place.images, []);
  }
});

test("each enriched OSM cover matches its stable ID, source and license without changing other places", () => {
  const places = parseCatalog(snapshot).filter(place => !place.local);
  const enriched = places.filter(place => place.images.length);
  assert.ok(enriched.length >= 41);
  assert.equal(osmPhotos.images.length, enriched.length);
  assert.deepEqual(new Set(enriched.map(place => place.id)), new Set(osmPhotos.images.map((photo: {placeId: string}) => photo.placeId)));
  for (const photo of osmPhotos.images) {
    const place = enriched.find(item => item.id === photo.placeId)!;
    assert.equal(place.name, photo.placeName);
    assert.deepEqual(place.images, [photo.path]);
    assert.equal(place.image, photo.path);
    assert.equal(place.photoCredit, `${photo.title} · ${photo.credit}`);
    assert.deepEqual(place.photoSource, {url: photo.sourcePage, license: photo.license, licenseUrl: photo.licenseUrl});
    assert.equal(createHash("sha256").update(readFileSync(new URL("../public" + photo.path, import.meta.url))).digest("hex"), photo.sha256);
  }
  assert.ok(places.filter(place => !place.photoSource).every(place => place.image === null && !place.images.length));
  const cover = snapshot.places.find((place: {photoSource?: unknown}) => place.photoSource);
  assert.throws(() => parseCatalog({places:[{ ...cover, photoSource: undefined }]}), /ghi công/);
  assert.throws(() => parseCatalog({places:[{ ...cover, id: "osm:node/999" }]}), /Đường dẫn ảnh/);
});

test("catalog boundary rejects duplicate IDs, non-HCM records, broken coordinates, unsafe media and source URLs", () => {
  const first = snapshot.places[0];
  assert.throws(() => parseCatalog({ places: [first, first] }), /trùng/);
  for (const fields of [
    { city: "dalat" }, { lat: NaN }, { lng: 181 }, { price: "10000" },
    { sourceUrl: "javascript:alert(1)" },
    { image: "https://example.com/other-place.jpg", images: ["https://example.com/other-place.jpg"] },
    { updated: "not-a-date" },
  ]) assert.throws(() => parseCatalog({ places: [{ ...first, ...fields }] }));
  assert.throws(() => parseCatalog({ places: null }));
  assert.deepEqual(parseCatalog({ places: [] }), []);
});

test("unknown price is distinct from an explicitly known zero price", () => {
  assert.equal(money(null), "Chưa cập nhật giá");
  assert.notEqual(money(0), money(null));
});

test("a profile with missing coordinates remains in the catalog without assigning a substitute", () => {
  const profile = { ...snapshot.places[0], lat: null, lng: null };
  const parsed = parseCatalog({places: [profile]});
  assert.equal(parsed[0].id, profile.id);
  assert.equal(parsed[0].lat, null);
  assert.equal(parsed[0].lng, null);
  const {lat, ...partial} = profile;
  assert.equal(parseCatalog({places: [partial]})[0].lat, null);
});
