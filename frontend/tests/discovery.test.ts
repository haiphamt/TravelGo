import test from "node:test";
import assert from "node:assert/strict";
import { withOsmFacets, type Place } from "../src/app/data.ts";
import { discoveryQuery, filterPlaces, mapQuery, parseDiscoveryFilters } from "../src/app/discovery.ts";
import { readFileSync } from "node:fs";
import { parseCatalog } from "../src/app/catalog.ts";

// Synthetic unit fixtures only; these are never seeded into the application catalog.
const place = (fields: Partial<Place> & Pick<Place, "id" | "name">): Place => ({
  city: "hcm", category: "food", local: false, area: "TP. Hồ Chí Minh", price: null,
  hours: null, image: null, images: [], products: [], description: "Unit fixture", lat: 10.77,
  lng: 106.7, updated: null, sourceUrl: "https://www.openstreetmap.org/", sourceLabel: "Fixture",
  sourceLicense: "Fixture", sourceUpdatedAt: null, referenceOnly: true, photoCredit: null, ...fields,
});

test("discovery query parsing accepts only known categories/sorts and explicit Local scope", () => {
  assert.deepEqual(parseDiscoveryFilters(new URLSearchParams("q=%20b%E1%BB%99t%20chi%C3%AAn%20&category=food&local=1&sort=name")), {
    query: "bột chiên", category: "food", localOnly: true, sort: "name",
  });
  assert.deepEqual(parseDiscoveryFilters(new URLSearchParams("category=unknown&local=true&sort=rating")), {
    query: "", category: "all", localOnly: false, sort: "default",
  });
});

test("discovery uses the same accent-insensitive name, product and area matching with category/Local filters", () => {
  const places = [
    place({ id: "local", name: "Gánh bánh", products: ["Bột chiên"], local: true }),
    place({ id: "osm", name: "Bột Chiên Thị Nghè" }),
    place({ id: "coffee", name: "Cà phê", category: "coffee", area: "Bình Thới", local: true }),
  ];
  const filters = parseDiscoveryFilters(new URLSearchParams("q=bot%20chien&category=food"));
  assert.deepEqual(filterPlaces(places, filters).map(p => p.id), ["local", "osm"]);
  assert.deepEqual(filterPlaces(places, { ...filters, localOnly: true }).map(p => p.id), ["local"]);
  assert.deepEqual(filterPlaces(places, { ...filters, query: "BINH THOI", category: "all" }).map(p => p.id), ["coffee"]);
  assert.equal(places[0].id, "local");
});

test("price sorting keeps unknown prices last and preserves their source order without treating missing as zero", () => {
  const places = [place({id: "missing-a", name: "A"}), place({id: "paid", name: "B", price: 20000}), place({id: "zero", name: "C", price: 0}), place({id: "missing-b", name: "D"})];
  const filters = parseDiscoveryFilters(new URLSearchParams("sort=price"));
  assert.deepEqual(filterPlaces(places, filters).map(p => p.id), ["zero", "paid", "missing-a", "missing-b"]);
  assert.deepEqual(places.map(p => p.id), ["missing-a", "paid", "zero", "missing-b"]);
  assert.equal(places[0].price, null);
});

test("map/list query serialization preserves actual filter scope and removes default fields", () => {
  const filters = parseDiscoveryFilters(new URLSearchParams("q=%20che%20&category=food&local=1&sort=name&page=3&from=other"));
  assert.deepEqual(discoveryQuery(filters), {q: "che", category: "food", local: "1", sort: "name"});
  assert.deepEqual(discoveryQuery(parseDiscoveryFilters(new URLSearchParams())), {q: null, category: null, local: null, sort: null});
});

test("the source address filter excludes missing addresses and round trips through map links", () => {
  const places = [
    place({ id: "match", name: "Bánh mì", area: "12 Bình Thới, TP. Hồ Chí Minh" }),
    place({ id: "name-only", name: "Bánh mì Bình Thới", area: "Nguyễn Trãi" }),
    place({ id: "unknown", name: "Bánh mì", area: "Chưa cập nhật địa chỉ" }),
  ];
  const filters = parseDiscoveryFilters(new URLSearchParams("q=banh%20mi&area=%20binh%20thoi%20&page=2"));
  assert.deepEqual(filterPlaces(places, filters).map(place => place.id), ["match"]);
  const query = mapQuery(new URLSearchParams("q=banh%20mi&area=binh%20thoi&page=2"), "match");
  assert.equal(query["area"], "binh thoi");
  assert.equal(query["page"], "2");
  assert.deepEqual(parseDiscoveryFilters({ get: name => query[name] ?? null }), filters);
  assert.deepEqual(filterPlaces(places, { ...filters, area: "chua cap nhat dia chi" }), []);
});

test("Local source groups filter the same catalog and survive list/detail/map query context", () => {
  const catalog = parseCatalog(JSON.parse(readFileSync(new URL("../public/data/catalog.json", import.meta.url),"utf8")));
  const filters = parseDiscoveryFilters(new URLSearchParams("localType=" + encodeURIComponent("Bánh và đồ ngọt")));
  assert.equal(filters.localOnly,true);
  assert.equal(filterPlaces(catalog,filters).length,19);
  assert.ok(filterPlaces(catalog,filters).every(place => place.local));
  const query = mapQuery(new URLSearchParams("q=banh&localType=" + encodeURIComponent("Bánh và đồ ngọt") + "&from=%2Fgoc-dia-phuong&page=2"),"tg-local-existing");
  assert.deepEqual(query,{q:"banh",category:null,local:"1",sort:null,localType:"Bánh và đồ ngọt",origin:"local",page:"2",place:"tg-local-existing"});
  const roundTrip = parseDiscoveryFilters({get:name=>query[name] ?? null});
  assert.deepEqual(roundTrip,parseDiscoveryFilters(new URLSearchParams("q=banh&local=1&localType=" + encodeURIComponent("Bánh và đồ ngọt"))));
  assert.equal(mapQuery(new URLSearchParams("from=%2Fban-do&origin=local&local=1&page=1"))["page"],"1");
  assert.equal(parseDiscoveryFilters(new URLSearchParams("localType=" + "x".repeat(81))).localType,undefined);
});

test("OSM facets enrich exact catalog IDs and survive list/detail/map query context", () => {
  const catalog = parseCatalog(JSON.parse(readFileSync(new URL("../public/data/catalog.json", import.meta.url), "utf8")));
  const sidecar = JSON.parse(readFileSync(new URL("../public/data/osm-facets.json", import.meta.url), "utf8"));
  const local = catalog.find(place => place.local)!;
  const places = withOsmFacets(catalog, { places: { ...sidecar.places, [local.id]: ["wifi"], "osm:node/0": ["wifi"] } });
  assert.equal(withOsmFacets(catalog, null), catalog);
  assert.deepEqual(places.map(place => place.id), catalog.map(place => place.id));
  assert.deepEqual(new Set(places.filter(place => place.facets?.length).map(place => place.id)), new Set(Object.keys(sidecar.places)));
  assert.equal(places.find(place => place.id === local.id)?.facets, undefined);

  const params = new URLSearchParams("facet=wifi&category=coffee&q=ca%20phe%20tran&page=2");
  const filters = parseDiscoveryFilters(params);
  assert.equal(filters.facet, "wifi");
  const results = filterPlaces(places, filters);
  assert.ok(results.some(place => place.id === "osm:node/3240763702"));
  assert.ok(results.every(place => place.category === "coffee" && place.facets?.includes("wifi")));
  const query = mapQuery(params, results[0].id);
  assert.equal(query["page"], "2");
  assert.equal(query["place"], results[0].id);
  assert.deepEqual(parseDiscoveryFilters({ get: name => query[name] ?? null }), filters);
  assert.equal(parseDiscoveryFilters(new URLSearchParams("facet=toString")).facet, undefined);
});

test("source districts are exact and can combine with free-text address search across list and map", () => {
  const catalog = parseCatalog(JSON.parse(readFileSync(new URL("../public/data/catalog.json", import.meta.url), "utf8")));
  const sidecar = JSON.parse(readFileSync(new URL("../public/data/osm-facets.json", import.meta.url), "utf8"));
  const local = catalog.find(place => place.local)!;
  const places = withOsmFacets(catalog, { ...sidecar, districts: { ...sidecar.districts, [local.id]: "Quận 1" } });
  assert.equal(places.filter(place => place.sourceDistrict).length, 363);
  assert.ok(places.every(place => !place.local || !place.sourceDistrict));
  const params = new URLSearchParams({ district: "quan 1", area: "lam son", page: "2" });
  const filters = parseDiscoveryFilters(params);
  assert.deepEqual(filterPlaces(places, filters).map(place => place.id), ["osm:way/801710792"]);
  assert.equal(filterPlaces(places, { ...filters, area: undefined }).length, 127);
  assert.ok(filterPlaces(places, { ...filters, area: undefined }).every(place => place.sourceDistrict === "Quận 1"));
  const query = mapQuery(params, "osm:way/801710792");
  assert.equal(query["page"], "2");
  assert.deepEqual(parseDiscoveryFilters({ get: name => query[name] ?? null }), filters);
});

test("24-hour filtering uses exact published hours and excludes closed places", () => {
  const catalog = parseCatalog(JSON.parse(readFileSync(new URL("../public/data/catalog.json", import.meta.url), "utf8")));
  const filters = parseDiscoveryFilters(new URLSearchParams({ facet: "always-open" }));
  const results = filterPlaces(catalog, filters);
  assert.equal(results.length, 166);
  assert.ok(results.every(place => place.hours === "24/7"));
  const closed: Place = { ...results[0], demoChange: {
    revision: "closed", kind: "closed", effectiveFrom: "2026-11-09", effectiveUntil: null, status: "closed", fields: [],
  } };
  assert.deepEqual(filterPlaces([closed, { ...results[1], hours: "24/7; PH off" }], filters), []);
});
