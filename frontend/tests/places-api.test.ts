import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ApiError, PlacesApi, csrfCookie, parseApiPlace, parseApiReview } from "../src/app/places-api.ts";
import { validPlaceId, restoreTripFields } from "../src/app/trip-storage.ts";
import { EMPTY_STATE, hcmToday, validateReview } from "../src/app/logic.ts";

const catalog = JSON.parse(readFileSync(new URL("../public/data/catalog.json", import.meta.url), "utf8"));
const place = { ...catalog.places[0], reviewCount: 0, rating: null };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const review = { id: "12", placeId: "osm:node/5922616527", rating: 4, text: "Hữu ích", photos: ["/api/review-photos/23"], photoIds: ["23"],
  visitedOn: null, updatedAt: "2026-11-15T05:00:00.000000Z", author: { id: "2", name: "Tài khoản thử" }, hidden: false, reply: null };

test("default fetch keeps the browser global receiver", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async function (this: unknown) {
    assert.equal(this, globalThis);
    return json({ data: [] });
  } as typeof fetch;
  try { assert.deepEqual(await new PlacesApi().favorites(), []); }
  finally { globalThis.fetch = original; }
});

test("review calendar uses Ho Chi Minh date across the UTC midnight boundary", () => {
  const today = hcmToday(new Date("2026-11-15T17:30:00Z"));
  assert.equal(today, "2026-11-16");
  assert.equal(validateReview({ rating: 4, text: "", photos: [], visitedOn: today }, today), "");
  assert.match(validateReview({ rating: 4, text: "", photos: [], visitedOn: "2026-11-17" }, today), /tương lai/);
});

test("API nulls keep unknown coordinates, prices, hours and aggregates distinct from zero", () => {
  const parsed = parseApiPlace({ ...place, price: null, lat: null, lng: null, hours: null, area: null, description: null, sourceUrl: null, sourceLabel: null, sourceLicense: null });
  assert.equal(parsed.price, null);
  assert.equal(parsed.lat, null);
  assert.equal(parsed.lng, null);
  assert.equal(parsed.hours, null);
  assert.equal(parsed.rating, null);
  assert.equal(parsed.reviewCount, 0);
  assert.equal(parsed.area, "Chưa cập nhật địa chỉ");
  assert.equal(parsed.description, "");
  assert.equal(parsed.sourceUrl, "");
  assert.equal(parseApiPlace({ ...place, price: 0, lat: 0, lng: 0 }).price, 0);
});

test("API adapter preserves photo attribution, Local source profile and filter metadata", () => {
  const photo = catalog.places.find((item: {photoSource?: unknown}) => item.photoSource);
  const parsed = parseApiPlace({ ...photo, facets: ["wifi", "wheelchair"], sourceDistrict: "Quận 1", rating: 4.5, reviewCount: 2 });
  assert.deepEqual(parsed.photoSource, photo.photoSource);
  assert.equal(parsed.photoCredit, photo.photoCredit);
  assert.equal(parsed.sourceLicense, photo.sourceLicense);
  assert.equal(parsed.sourceDistrict, "Quận 1");
  assert.deepEqual(parsed.facets, ["wifi", "wheelchair"]);
  const local = catalog.places.find((item: {local: boolean}) => item.local);
  assert.deepEqual(parseApiPlace(local).localProfile, local.localProfile);
  assert.throws(() => parseApiPlace({ ...photo, photoSource: null }), /ghi công/);
});

test("TravelGo created IDs survive the shared ID and saved-trip boundary", () => {
  const id = "tg-place-37d7c541-b4e5-8d01-8bf7-e5dbc0466e1f";
  assert.equal(validPlaceId(id), true);
  assert.equal(parseApiPlace({ ...place, id, image: null, images: [], photoSource: null }).id, id);
  const restored = restoreTripFields({ ...EMPTY_STATE, trip: [{ placeId: id, time: "09:00" }] });
  assert.equal(restored.trip[0].placeId, id);
  assert.equal(validPlaceId("tg-place-------------------------------------"), false);
  assert.equal(validPlaceId(id.toUpperCase()), false);
  assert.equal(validPlaceId("osm:node/5922616527"), true);
});

test("API adapter rejects unsafe URLs, out of range values and malformed review references", () => {
  for (const patch of [{ sourceUrl: "javascript:alert(1)" }, { lat: 91 }, { price: -1 }, { rating: 0 }, { reviewCount: -1 },
    { image: "//example.com/photo.jpg", images: ["//example.com/photo.jpg"] }, { id: "osm:unknown/2" }])
    assert.throws(() => parseApiPlace({ ...place, ...patch }));
  const parsed = parseApiReview(review);
  assert.equal(parsed.id, "12");
  assert.deepEqual(parsed.photoIds, ["23"]);
  assert.equal(parsed.visitedOn, "");
  assert.equal(parseApiReview({ ...review, hidden: true }).hidden, true);
  assert.throws(() => parseApiReview({ ...review, photoIds: [] }));
  assert.throws(() => parseApiReview({ ...review, rating: 4.5 }));
  assert.throws(() => parseApiReview({ ...review, visitedOn: "2026-02-30" }));
});

test("detail and review lookups encode the whole OSM ID including its slash", async () => {
  const paths: string[] = [];
  const api = new PlacesApi((async input => {
    paths.push(String(input));
    return json({ data: String(input).includes("/mine?") ? review : place });
  }) as typeof fetch, () => "");
  await api.detail("osm:node/5922616527");
  await api.ownReview("osm:node/5922616527");
  assert.deepEqual(paths, ["/api/places/detail?id=osm%3Anode%2F5922616527", "/api/reviews/mine?placeId=osm%3Anode%2F5922616527"]);
});

test("favorites use same-origin authenticated JSON and decoded CSRF cookie, without a UI actor", async () => {
  const requests: { path: string; init: RequestInit }[] = [];
  const api = new PlacesApi((async (input, init) => {
    requests.push({ path: String(input), init: init! });
    return json({ data: [review.placeId] });
  }) as typeof fetch, () => "other=a; XSRF-TOKEN=token%2Babc%3D; extra=b");
  await api.favorites("PUT", review.placeId);
  await api.favorites("DELETE", review.placeId);
  assert.equal(requests[0].path, "/api/favorites");
  assert.equal(requests[0].init.credentials, "same-origin");
  assert.equal((requests[0].init.headers as Record<string, string>)["X-XSRF-TOKEN"], "token+abc=");
  assert.deepEqual(JSON.parse(requests[0].init.body as string), { placeId: review.placeId });
  assert.equal(requests[1].init.method, "DELETE");
  assert.equal(csrfCookie("XSRF-TOKEN=%broken"), "");
});

test("authentication, session expiry and validation failures remain visible to callers", async () => {
  for (const status of [401, 403, 419, 429, 500]) {
    const api = new PlacesApi((async () => json({ message: "Internal details" }, status)) as typeof fetch, () => "");
    await assert.rejects(api.favorites(), (error: unknown) => error instanceof ApiError && error.status === status && !error.message.includes("Internal details"));
  }
  const invalid = new PlacesApi((async () => json({ errors: { rating: ["Chọn từ 1 đến 5 sao."] } }, 422)) as typeof fetch, () => "");
  await assert.rejects(invalid.saveReview(parseApiReview(review)), /Chọn từ 1 đến 5 sao/);
  const offline = new PlacesApi((async () => { throw new TypeError("network"); }) as typeof fetch, () => "");
  await assert.rejects(offline.catalog(), /Không kết nối/);
});

test("catalog consumes API pages and rejects duplicates or changed totals instead of mixing snapshots", async () => {
  const second = { ...place, id: "osm:node/88888", image: null, images: [], photoSource: null };
  const makeApi = (changed: boolean, duplicate: boolean) => new PlacesApi((async input => {
    const page = Number(new URL(String(input), "https://travelgo.test").searchParams.get("page"));
    return json({ data: [page === 1 || duplicate ? place : second], meta: { current_page: page, last_page: 2, per_page: 1, total: changed && page === 2 ? 3 : 2 } });
  }) as typeof fetch, () => "");
  assert.deepEqual((await makeApi(false, false).catalog()).map(item => item.id), [place.id, second.id]);
  await assert.rejects(makeApi(true, false).catalog(), /vừa thay đổi/);
  await assert.rejects(makeApi(false, true).catalog(), /vừa thay đổi/);
});

test("home suggestions only request the first page for the selected category and facet", async () => {
  const photo = catalog.places.find((item: {photoSource?: unknown}) => item.photoSource);
  const controller = new AbortController();
  let calls = 0;
  const api = new PlacesApi((async (input, init) => {
    ++calls;
    const url = new URL(String(input), "https://travelgo.test");
    assert.equal(url.pathname, "/api/places");
    assert.deepEqual(Object.fromEntries(url.searchParams), { category: "all", has_image: "1", per_page: "8", facet: "wifi" });
    assert.equal(init?.signal, controller.signal);
    return json({ data: [photo], meta: { current_page: 1, last_page: 2, per_page: 8, total: 9 } });
  }) as typeof fetch, () => "");

  assert.equal((await api.suggestions("all", "wifi", controller.signal))[0].id, photo.id);
  assert.equal(calls, 1);
});

test("editing submits stable retained photo URLs and empty visit date as null", async () => {
  let payload: unknown;
  const api = new PlacesApi((async (_input, init) => {
    payload = JSON.parse(init!.body as string);
    return json({ data: review });
  }) as typeof fetch, () => "XSRF-TOKEN=sample");
  const saved = await api.saveReview(parseApiReview(review));
  assert.equal(saved.id, review.id);
  assert.deepEqual(payload, { placeId: review.placeId, rating: 4, text: review.text, visitedOn: null, photos: ["/api/review-photos/23"] });
});

test("public review pages preserve hidden-aware server summary and stable photo IDs", async () => {
  const api = new PlacesApi((async () => json({ data: [review], meta: { current_page: 1, last_page: 1, per_page: 20, total: 1 },
    summary: { count: 1, average: 4 } })) as typeof fetch, () => "");
  const result = await api.reviews(review.placeId);
  assert.deepEqual(result.summary, { count: 1, average: 4 });
  assert.deepEqual(result.data[0].photoIds, ["23"]);
});
