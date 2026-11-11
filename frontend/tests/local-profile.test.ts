import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { parseCatalog } from "../src/app/catalog.ts";

const catalogBytes = readFileSync(new URL("../public/data/catalog.json", import.meta.url));
const snapshot = JSON.parse(catalogBytes.toString("utf8"));
const manifest = JSON.parse(readFileSync(new URL("../public/data/sources.json", import.meta.url), "utf8"));
const locals = snapshot.places.filter((place: {local: boolean}) => place.local);
const first = locals[0];
const sha256 = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");

test("the prepared 50 Local profiles are enriched with source metadata and without bundled reference photos", () => {
  const parsed = parseCatalog(snapshot);
  assert.equal(parsed.filter((place) => place.localProfile).length, 50);
  assert.ok(parsed.filter((place) => !place.local).every((place) => !place.localProfile));
  // Baseline excludes the four audited administrative/restricted records.
  // Local profiles were checked against travelgo-local-50.json (hash below).
  assert.equal(sha256(JSON.stringify(snapshot.places.map(({localProfile, photoSource, ...place}) =>
    photoSource ? {...place, image: null, images: [], photoCredit: null} : place))),
    "43bd42a1ae5be39e1c5dca39beb0d9d5d82333742f57c53d528af609460e162c");
  assert.equal(sha256(JSON.stringify(locals.map(({id, localProfile}) => ({id, localProfile})))),
    "32051a968dac89f61d11cd61df0756e179249b3af175a92c2b0304306a2ba43a");
  const community = manifest.sources.find((source: {id: string}) => source.id === "community-local");
  assert.equal(community.sourceFileSha256, "4dc2045c32fa093d2b334ca8ffb150c58b1d9689bec011f978f1356105af988f");
  assert.equal(manifest.catalogSha256, sha256(catalogBytes));
  assert.equal(community.photoCount, 0);
  assert.deepEqual(manifest.images, []);
});

test("source hours retain Monday–Sunday order, date meanings, unknowns and quality flags", () => {
  const profiles = parseCatalog(snapshot).filter((place) => place.local).map((place) => place.localProfile!);
  const weekdays = profiles.filter((profile) => profile.hours.weekdays.length);
  const summaryOnly = profiles.filter((profile) => !profile.hours.weekdays.length);
  assert.equal(weekdays.length, 47);
  assert.equal(summaryOnly.length, 3);
  const labels = ["Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy", "Chủ Nhật"];
  for (const profile of weekdays) {
    assert.deepEqual(profile.hours.weekdays.map((day) => day.split(": ")[0]), labels);
    assert.match(profile.hours.observedAt!, /^2026-10-15T/);
    assert.match(profile.hours.sourceLabel, /tham chiếu Google từ website nguồn/);
  }
  assert.ok(summaryOnly.every((profile) => profile.hours.summary && profile.hours.observedAt === null));
  assert.equal(profiles.filter((profile) => profile.hours.qualityFlags.some((flag) => flag.includes("mở cả ngày"))).length, 3);
  assert.equal(profiles.filter((profile) => profile.hours.qualityFlags.some((flag) => flag.includes("qua nửa đêm"))).length, 1);
  for (const profile of profiles) {
    assert.match(profile.productsNote, /chưa phải thực đơn đầy đủ/);
    assert.match(profile.collectedAt!, /^2026-11-08T/);
    assert.equal(profile.preparedAt, "2026-11-08T04:04:28.712790+00:00");
    assert.notEqual(profile.collectedAt, profile.preparedAt);
    assert.ok(profile.sources.every((source) => source.url.startsWith("https://") && !source.url.includes("/api/")));
    assert.ok(!profile.hours.sourceUrl.includes("/api/"));
  }
});

test("Local metadata is optional for older catalog payloads and does not fill missing weekdays", () => {
  const {localProfile, ...older} = first;
  assert.equal(parseCatalog({places: [older]})[0].localProfile, undefined);
  const sparseHours = {...localProfile, hours: {...localProfile.hours,
    summary: null, weekdays: ["Thứ Hai: 05:00 đến 09:00", "Thứ Tư: Đóng cửa"], observedAt: null}};
  const result = parseCatalog({places: [{...first, localProfile: sparseHours}]})[0].localProfile!;
  assert.equal(result.hours.summary, null);
  assert.equal(result.hours.observedAt, null);
  assert.deepEqual(result.hours.weekdays, sparseHours.hours.weekdays);
});

test("Local boundary rejects malformed nested fields, invalid dates and unsafe source URLs", () => {
  const profile = first.localProfile;
  const invalidProfiles = [
    [], "metadata", {...profile, categoryLabel: 5}, {...profile, productsNote: null},
    {...profile, hours: []}, {...profile, hours: null},
    {...profile, hours: {...profile.hours, summary: 5}},
    {...profile, hours: {...profile.hours, weekdays: "hằng ngày"}},
    {...profile, hours: {...profile.hours, weekdays: [3]}},
    {...profile, hours: {...profile.hours, qualityFlags: [false]}},
    {...profile, hours: {...profile.hours, sourceLabel: ""}},
    {...profile, hours: {...profile.hours, observedAt: "2026-02-30T01:00:00Z"}},
    {...profile, hours: {...profile.hours, observedAt: "2026-11-08T24:00:00Z"}},
    {...profile, collectedAt: "not-a-date"}, {...profile, preparedAt: 20261108},
    {...profile, sources: {}}, {...profile, sources: []}, {...profile, sources: [null]},
    {...profile, sources: [{label: "Nguồn", url: "https://example.com", updatedAt: "2026-13-01"}]},
    ...["http://example.com", "javascript:alert(1)", "https://name:password@example.com"].flatMap((url) => [
      {...profile, hours: {...profile.hours, sourceUrl: url}},
      {...profile, sources: [{label: "Nguồn", url, updatedAt: null}]},
    ]),
  ];
  for (const localProfile of invalidProfiles) {
    assert.throws(() => parseCatalog({places: [{...first, localProfile}]}));
  }
  assert.throws(() => parseCatalog({places: [{...first, local: false}]}));
});
