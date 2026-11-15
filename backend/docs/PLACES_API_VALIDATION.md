# Task 2 validation — 2026-11-15

Branch: `feat/places-reviews-api`, based on schema commit `362b450` in PR #4. Laravel 13.42.0, PHP 8.3.36, MySQL 8.4.13, Node 24.14.1. No production data or real login credentials used.

## Commands and observed results

From `backend/` (use your installed PHP executable):

```powershell
php artisan test --colors=never
php vendor/bin/pint --test app/Http/Controllers app/Http/Resources app/Models/Place.php app/Models/Favorite.php app/Models/Review.php app/Models/ReviewPhoto.php app/Services/ReviewImages.php bootstrap/app.php routes/api.php database/factories/PlaceFactory.php database/migrations/2026_11_15_000100_create_place_engagement_tables.php tests/Feature/PlacesApiTest.php tests/Feature/PlaceEngagementTest.php tests/Feature/PlacesSchemaTest.php
```

The final full suite passed **75 tests / 420 assertions**, zero failures, in 250.79 seconds. The final run includes the photo-only version and storage-failure regression. JUnit evidence is listed below.

Feature tests require the dedicated `travelgo_test` MySQL schema. Before migrations, each database test checks the application environment, configured database, actual `SELECT DATABASE()` and MySQL rather than MariaDB. Coverage includes accent/no-accent and `đ` search, combined filters, literal wildcard search, stable pages, nullable data, complete OSM slash IDs, unique favorites and account separation, author-only review edit/delete, invalid review/date/image boundaries, stable image IDs, hidden review/photo visibility and aggregates, CSRF, HCM midnight and storage rollback.

From `frontend/`:

```powershell
npm ci --legacy-peer-deps --no-audit --no-fund
npm test
npm run build
```

- `npm test`: **54/54 passed** (42 existing and 12 API/date/fetch regression cases).
- Production build: **passed**, initial bundle 715.95 kB. Warnings: 15.95 kB above the existing 700 kB warning threshold, and Leaflet CommonJS. The 1 MB error limit was not exceeded. No dependency versions or budget limits changed.
- Plain `npm ci` fails with missing `@emnapi` peer entries in the existing lockfile; `--legacy-peer-deps` installs its 479 locked packages without editing the lockfile.
- On this Windows machine the sandbox blocked Angular compiler directory reads; the successful build ran with the required filesystem permission.

## Actual HTTP image boundaries

Local HTTP server used an isolated `travelgo_preview` MySQL database, a real Laravel session cookie and CSRF header. PHP loaded `post_max_size=24M`, a writable `sys_temp_dir`, `display_errors=Off`, `display_startup_errors=Off`, `log_errors=On`.

- Three images of exactly 5,242,880 decoded bytes each: **200**, three photo IDs; request JSON 20,971,735 bytes.
- Repeated request: **200**, same review and photo IDs.
- Image 1 byte over 5 MiB: **422**, saved record unchanged.
- Declared JPEG MIME with PNG bytes: **422**, saved record unchanged.
- Request JSON 26,214,550 bytes (>24 MiB): **413**, saved record unchanged.
- Cleanup: **200**; own review is null and all three image URLs return **404**.

The minimal local PHP ini initially had an inaccessible default temporary directory and displayed startup warnings. This caused large requests to fail before Laravel. The above results were obtained after correcting that runtime configuration. Required deployment settings are documented in `PLACES_API.md`.

## Browser validation

Headless installed Chrome through Playwright; desktop 1365×900 and mobile 390×844. Nine real place records from the checked-in catalog were inserted only into the isolated preview database. Two real Laravel session fixtures were generated locally, without introducing a login endpoint.

- **20/20** main flow checks: discovery → detail with encoded OSM slash ID → save favorite → favorites list → create/edit review and real JPEG upload, stable IDs; Local discovery/detail, second-account isolation and unauthenticated 401.
- **9/9** same-editor account-switch checks: clear old draft/preview/photos, load and save the next account's own record, restore the first author's record, clear state on logout, preserve a guest's new draft when submission requires login.
- **3/3** delayed-thumbnail checks: an old account's pending image does not appear after switching accounts. Only the thumbnail Promise was controlled to reproduce the race; session/API requests were real.
- API 503 and empty states were explicitly mocked in the main checks; these do not claim an actual production outage.
- No Angular page errors or horizontal overflow. Console messages were expected guest 401/mock 503, plus an existing missing favicon 404. No CSS files changed.

## Local evidence and remaining dependencies

Evidence is in `.analysis_travelgo/places_api/`: `phpunit-final.xml`, `phpunit-photo-version.xml`, `qa-report.json`, `qa-account-switch.json`, `qa-photo-race.json`, `http-boundary-results.json`, browser scripts and screenshots. These diagnostics and private runtime/session files are not part of the proposed source change; do not commit them wholesale.

PR #4 remains open for Minh Hiếu's schema review. The actual data importer, Tuấn Hải's login/logout and Quang Huy's moderation/replies/approved changes are not present on the integration branch. Tests use fixtures for these boundaries; a final cross-branch end-to-end run is still required after those modules merge. `TravelStore.refreshAccount()` must be called by the account module after login/logout. Full-catalog import and repeat-import verification remain Minh Hiếu's task. Review/file lifecycle on account/place deletion outside these author APIs must be agreed with the integrating module.
