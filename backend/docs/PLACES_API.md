# Task 2 — Places, favorites and reviews

Owner: Lê Nguyễn Hữu Hiếu. This change builds on the places migration in [PR #4](https://github.com/haiphamt/TravelGo/pull/4). The schema contract for Minh Hiếu remains in [PLACES_SCHEMA.md](PLACES_SCHEMA.md). Integration branch: `feat/travelgo-frontend`; API work: `feat/places-reviews-api`.

## Run locally

Use PHP 8.3+, MySQL 8.4 and the setup in [backend/README.md](../README.md). Run `php artisan migrate`. Minh Hiếu owns the production catalog import; this change does not add a competing import command. An empty database returns an empty catalog. Do not run Feature tests against development data: `.env.testing` must point to the separate MySQL `travelgo_test` schema.

For development, start Laravel on `127.0.0.1:8000` and run `npm start` in `frontend/`. Angular proxies `/api/**` to Laravel. Production must serve `/api` from Laravel on the same origin as Angular and keep the existing static `/images` assets available.

Review images use JSON Base64, so three 5 MiB files produce approximately 20 MiB of JSON. Configure PHP `post_max_size=24M` or greater and the reverse proxy's request body limit to at least 24 MiB. For the built-in PHP server, set these options in the PHP ini that its child process loads. PHP needs a writable `sys_temp_dir` to buffer large requests. Use `display_errors=Off`, `display_startup_errors=Off`, `log_errors=On` so startup warnings cannot corrupt JSON or HTTP status codes. `upload_max_filesize` alone does not configure JSON payloads. The application still enforces a 5 MiB decoded limit for each image and a maximum of three images.

## Public place lookup

- `GET /api/places`: `city=hcm` (default), `q` (max 200 characters), `category=all|coffee|food|nature|culture|drink|lodging`, `local=0|1`, `has_image=0|1`, `area`, `district`, `localType`, `facet`, `sort=default|name|price`, `page`, `per_page` (default 24, maximum 200).
- `GET /api/places/catalog`: streams `{ "data": [...] }` in the default list order for views that need the complete TP.HCM catalog. Entries use the same fields as the paginated list.
- Home suggestions request `has_image=1&per_page=8` with the selected category and optional facet. The server filters to places with a cover image before pagination.
- `facet`: `always-open|wifi|outdoor|takeaway|wheelchair|hotel|homestay|viewpoint`. `always-open` means the source records exactly `24/7`; it does not infer current opening status.
- `q` searches name, products and address with Vietnamese accent/case folding, including `đ`. `%` and `_` are literal text. `area` is a partial match; `district` matches the entire normalized district. `localType` matches the exact Local category label and implies `local=1`.
- Filters combine. Name and price sorts use internal ID as a stable tie breaker. Missing prices sort last. The default order places entries with a cover image before those without one, including in Local results. Within entries with a cover, attributed photos sort first, then internal ID.
- `GET /api/places/detail?id=osm%3Anode%2F5922616527`: query parameter lookup preserves the whole public ID, including `/`. Do not split an OSM public ID into a path identifier. `tg-local-*`, `tg-place-*`, and existing `tg-demo-*` IDs are preserved.

List response:

```json
{"data":[],"meta":{"current_page":1,"last_page":1,"per_page":24,"total":0}}
```

Detail response is `{"data":{...}}`. Place fields use the Angular camelCase contract: `id`, `name`, `city`, `category`, `local`, `area`, `sourceDistrict`, `price`, `hours`, `description`, `lat`, `lng`, `image`, `images`, `products`, `facets`, `mobile`, `photoCredit`, `photoSource`, `localProfile`, `sourceUrl`, `sourceLabel`, `sourceLicense`, `sourceUpdatedAt`, `updated`, `referenceOnly`, `reviewCount`, `rating`.

Unknown scalar values remain `null`; unknown lists become `[]`. Coordinates and prices are never replaced with zero. Source/license/credit/Local profile values come from stored source data. No reviews means `reviewCount=0` and `rating=null`. The Angular adapter supplies the existing missing-address label only for display. It loads catalog pages in batches of four to preserve the existing filters, nearby search, map and itinerary behavior. An API failure displays the existing error state; it does not silently switch to browser demo data.

## Session and favorites

Authenticated routes use Laravel's `web` session guard, `web` middleware and CSRF protection. They do not accept a user ID or a frontend role as credentials. Tuấn Hải owns actual login/logout; no temporary login API is shipped in this change.

1. After login, call `TravelStore.refreshAccount()`; call it again after logout/account changes to clear private state and reload the current account.
2. `GET /api/favorites` returns `{"data":["osm:node/5922616527"]}` and sets the Laravel `XSRF-TOKEN` cookie for an authenticated session.
3. Send `credentials: "same-origin"`, `Accept: application/json`, JSON `Content-Type`, and the URL-decoded `XSRF-TOKEN` cookie in `X-XSRF-TOKEN` for writes.
4. `PUT /api/favorites` and `DELETE /api/favorites` take `{"placeId":"osm:node/5922616527"}` and return the current account's entire favorite ID list. Repeated add/remove requests are idempotent. A unique `(user_id, place_id)` database key protects concurrent adds.

Private favorites/reviews never load from or save to the browser demo's IndexedDB. Its itinerary/room functionality remains separate. A failed write preserves the previous saved UI state and displays an error.

## Reviews

- `GET /api/reviews?placeId=...&page=1&per_page=10`: public list, maximum 50 per page, newest ID first. Response: `{"data":[...],"meta":{...},"summary":{"count":0,"average":null}}`. Summary covers all visible reviews, not just the current page.
- `GET /api/reviews/mine?placeId=...`: authenticated author's own record, including a hidden record, or `{"data":null}`.
- `POST /api/reviews`: create or replace the authenticated account's one review at a place. Repeating a request keeps the same review ID. `PUT /api/reviews/{id}` edits an existing review and requires its author; moving it to another place is rejected.
- `DELETE /api/reviews/{id}`: author only; returns `{"data":null}` and removes the review and its stored photos.

Write body (all shown fields required; date may be null and photos may be empty):

```json
{"placeId":"osm:node/5922616527","rating":4,"text":"Đã ghé.","visitedOn":null,"photos":[]}
```

`rating` is an integer 1–5. `text` is at most 500 Unicode characters and may be empty. `visitedOn` is a real `YYYY-MM-DD` date no later than today in `Asia/Ho_Chi_Minh`. Maximum three JPEG/PNG/WebP images, 5 MiB each after decoding, maximum 60 million pixels. The server checks decoded bytes, detected MIME and image dimensions; a declared MIME or file extension is insufficient.

New photos are `data:image/png;base64,...` strings. To retain an existing photo when editing, send its exact `/api/review-photos/{id}` URL. Only photos belonging to that author's same review may be retained. Retained IDs and byte-identical retried uploads keep their IDs and hide decisions. Omitting an existing photo removes it. `updatedAt` advances on photo-only edits too.

Review response fields: `id` (decimal string), `placeId`, `author: {id,name}`, `rating`, `text`, `visitedOn`, `photos` (relative URLs), `photoIds` (decimal strings), `updatedAt`, `hidden`, `reply` (currently null). Public responses exclude email and private file paths. Author names are public review attribution.

Images are stored on the private `local` disk, served only through `GET /api/review-photos/{id}` with `nosniff` and `private, no-store`. An anonymous/non-author request for a hidden photo or a photo of a hidden review gets 404, including direct image URLs. The author may access their own hidden photo through their session. Public lists omit individually hidden photos even when the author is viewing them.

## Contract for Quang Huy

`reviews.id` and `review_photos.id` are stable internal report targets. Both tables have nullable `hidden_at`. Public review lists and place aggregates exclude hidden reviews; photo visibility also checks its parent review. Author edits do not clear moderator hide decisions. Public place lookups read the canonical `places` row; Huy's approved update transaction must update that row after approval. Unapproved browser demo changes cannot rewrite API data.

This is a proposed integration contract, not confirmation from Huy. Owner replies, report endpoints, moderation history/permissions and approval/version transactions remain Task 5. `reply:null` and the frontend's existing reply rendering reserve the response shape. Before merging with Task 5, agree on version/conflict handling, reply attribution and file cleanup when accounts/places are deleted outside these author endpoints (database FK cascades do not delete physical files).

## Errors and remaining integration

Laravel JSON errors use `message` and, for validation, `errors`. Status codes: 401 no session; 403 non-author action; 404 unknown place/review/photo or hidden media; 419 invalid/expired CSRF token; 422 invalid fields/ownership of retained photos; 413 body exceeding server limits; 500 storage/server failure. Frontend preserves the draft on validation/network/storage failure and uses existing messages/retry controls. An explicit account refresh or lost session clears private editor state to prevent another account inheriting it.

Pending: PR #4 review and merge; Minh Hiếu's real importer and repeat-import test; Tuấn Hải's login/logout plus calls to `refreshAccount()`; Quang Huy's approved updates, owner replies and actual moderation endpoints. Feature fixtures validate these boundaries independently, but do not prove those other branches are integrated. See `PLACES_API_VALIDATION.md` for observed validation results.
