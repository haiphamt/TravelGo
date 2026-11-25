import test from "node:test";
import assert from "node:assert/strict";
import { ModerationClient, ModerationError, csrfToken } from "../src/app/moderation-api.ts";
import { validPlaceId } from "../src/app/trip-storage.ts";
import { placeRevision } from "../src/app/workflow.ts";
import type { Place } from "../src/app/data.ts";

test("approved TravelGo IDs survive saved references and server revision takes precedence", () => {
  assert.equal(validPlaceId("tg-place-12345678-1234-1234-1234-123456789abc"), true);
  assert.equal(validPlaceId("tg-place-CLIENT-CHOICE"), false);
  assert.equal(placeRevision({revision: "server-hash", demoChange: {revision: "browser-demo"}} as Place), "server-hash");
});

test("CSRF token uses the decoded Laravel cookie and rejects malformed encoding", () => {
  assert.equal(csrfToken("other=a; XSRF-TOKEN=token%2Bwith%3Dpadding; theme=light"), "token+with=padding");
  assert.equal(csrfToken("XSRF-TOKEN=%oops"), "");
  assert.equal(csrfToken("other=a"), "");
});

test("place IDs containing slash remain a single encoded query value", async () => {
  const urls: string[] = [];
  const client = new ModerationClient(async (url, options) => {
    urls.push(String(url));
    assert.equal(options?.credentials, "same-origin");
    return Response.json({data: {id: "osm:node/123"}});
  });
  await client.place("osm:node/123");
  assert.equal(urls[0], "/api/moderation/place?id=osm%3Anode%2F123");
});

test("the browser fetch implementation receives its required global receiver", async () => {
  const client = new ModerationClient(async function () {
    assert.equal(this, globalThis);
    return Response.json({data: {id: "demo", admin: false}});
  });
  assert.equal((await client.session()).id, "demo");
});

test("all private pages load and admin queue uses its separate endpoint", async () => {
  const urls: string[] = [];
  const client = new ModerationClient(async url => {
    urls.push(String(url));
    const page = new URL(String(url), "http://localhost").searchParams.get("page");
    return Response.json({data: [{id: `request-${page}`}], meta: {current_page: Number(page), last_page: 2}});
  });
  assert.deepEqual((await client.requests(true)).map(item => item.id), ["request-1", "request-2"]);
  assert.match(urls[0], /^\/api\/moderation\/queue\?/);
  assert.match(urls[1], /page=2$/);
});

test("invalid pagination fails instead of returning an incomplete queue", async () => {
  const client = new ModerationClient(async () => Response.json({data: [], meta: {current_page: 9, last_page: 9}}));
  await assert.rejects(client.requests(false), /Phân trang máy chủ không hợp lệ/);
});

test("admin overview keeps real counts and rejects incomplete ranking data", async () => {
  const data = {
    catalog: {places: 5, users: 2, reviews: 0, favorites: 0},
    topPlaces: [],
  };
  const client = new ModerationClient(async (url, options) => {
    assert.equal(url, "/api/moderation/overview");
    assert.equal(options?.credentials, "same-origin");
    return Response.json({data});
  });
  assert.deepEqual(await client.overview(), data);
  const malformed = new ModerationClient(async () => Response.json({data: {
    ...data, topPlaces: [{id: "osm:node/123", name: "Cà phê", area: null, reviewCount: 0, rating: 5}],
  }}));
  await assert.rejects(malformed.overview(), /Số liệu điều hành từ máy chủ không hợp lệ/);
});

test("writes preserve server version and use session cookies and CSRF header", async () => {
  const client = new ModerationClient(async (url, options) => {
    assert.equal(url, "/api/moderation/demo/decision");
    assert.equal(options?.method, "POST");
    assert.equal(options?.credentials, "same-origin");
    assert.deepEqual(JSON.parse(String(options?.body)), {expectedVersion: 3, decision: "approved"});
    assert.equal((options?.headers as Record<string, string>)["Accept"], "application/json");
    assert.ok("X-XSRF-TOKEN" in (options?.headers as object));
    return Response.json({data: {version: 4}});
  });
  await client.request("moderation/demo/decision", "POST", {expectedVersion: 3, decision: "approved"});
});

test("validation errors and session/conflict failures stay failures without browser fallback", async () => {
  for (const status of [401, 403, 409, 419, 422]) {
    const client = new ModerationClient(async () => Response.json({message: "Không lưu", errors: {reason: ["Nhập lý do."]}}, {status}));
    await assert.rejects(client.request("contributions", "POST", {}), error =>
      error instanceof ModerationError && error.status === status && error.message === "Nhập lý do.");
  }
});

test("network failures and successful HTML responses are rejected", async () => {
  const offline = new ModerationClient(async () => { throw new TypeError("offline"); });
  await assert.rejects(offline.session(), error => error instanceof ModerationError && error.status === 0);
  const html = new ModerationClient(async () => new Response("<html>fallback</html>"));
  await assert.rejects(html.session(), /Phản hồi máy chủ không hợp lệ/);
});
