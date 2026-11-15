# Kết quả kiểm tra Task 5

Ngày kiểm tra: **15/11/2026**, nhánh `feat/owner-moderation`, base `f4406f5`. AI/Codex hỗ trợ code và test; đã đọc diff, đối chiếu quy tắc và kiểm tra bằng công cụ thực tế. Các tài khoản, cơ sở và thông tin đối chiếu trong minh chứng đều là dữ liệu demo tự tạo.

## Kết quả thực tế

| Kiểm tra | Kết quả |
| --- | --- |
| PHP / MySQL | PHP 8.4.27, Laravel 13.42.0 theo composer.lock, MySQL Community 8.4.13. Database riêng `travelgo_test`, tài khoản chỉ có quyền schema test. |
| `php artisan test --no-ansi` | **25 passed, 138 assertions**, không skip. [Log](evidence/phpunit.txt). |
| `php vendor/bin/pint --dirty` | Passed sau khi định dạng các file PHP của task. |
| `php artisan route:list --path=api --except-vendor --no-ansi` | Đăng ký đủ 12 route thuộc moderation, contributions và owner. |
| `npm test` | **51 passed, 0 failed**. [Log](evidence/frontend-tests.txt). Gồm test mới cho CSRF cookie, phân trang, mã OSM có `/`, lỗi phiên/quyền/xung đột/validation, mạng/HTML fallback và receiver của browser fetch. |
| `npm run build` | **Exit 0**. Initial bundle **704.13 kB**, vượt ngưỡng warning 700 kB **4.13 kB**, vẫn dưới ngưỡng error 1 MB; thêm warning CommonJS của Leaflet. Không nâng dependency để xử lý warning ngoài task. |
| Chrome headless / Playwright | Luồng thật qua Laravel session/API và MySQL: gửi đóng góp, admin duyệt, xin quyền, admin cấp quyền, owner xem đúng cơ sở, tài khoản thường bị chặn `/quan-tri`. **Passed**, không có page error. [Kết quả](evidence/browser-qa.txt). |
| Responsive | **1440×1000** và **390×844**; kiểm tra không tràn ngang trên hai màn Chủ cơ sở/Quản trị viên. Giữ CSS và cấu trúc giao diện. |

Các Feature Test bao phủ tác giả riêng, dữ liệu chưa duyệt không công khai, thiếu phiên/quyền, giả actor/user ID, đầu vào sai, bytes ảnh giả, cấp/thu hồi quyền theo cơ sở, phản hồi sai phiên bản, rút/bổ sung đúng trạng thái, quyết định gửi lặp, snapshot địa điểm cũ, rollback khi ghi history thất bại, thứ tự cập nhật cùng timestamp, reconcile không làm đổi revision vô cớ, giờ Việt Nam và khôi phục khi hết thay đổi tạm, xung đột nguồn, giữ/ẩn bài/ẩn đúng ảnh và CSRF ngoài bypass PHPUnit.

## Minh chứng giao diện

- [Đóng góp — desktop](evidence/contribution-desktop.png)
- [Xét duyệt — desktop](evidence/moderation-desktop.png) · [mobile](evidence/moderation-mobile.png)
- [Chủ cơ sở — desktop](evidence/owner-desktop.png) · [mobile](evidence/owner-mobile.png)

## Cách chạy lại

1. Cài backend theo `backend/README.md`, tạo `.env.testing` trên MySQL `travelgo_test` riêng. Test xác minh tên schema và engine trước khi reset. `Tests\TestCase` nạp fixture migration của các PR chưa merge; các file này không đăng ký ở production.
2. Chạy trong `backend/`: `php artisan test`, rồi `php vendor/bin/pint --dirty --test`. Trong `frontend/`: `npm ci --legacy-peer-deps`, `npm test`, `npm run build`. `npm ci` thông thường trên máy kiểm tra báo thiếu peer `@emnapi/core`/`@emnapi/runtime` trong lock có sẵn; `--legacy-peer-deps` cài thành công và **không sửa package.json/package-lock.json**.
3. Sau khi PHPUnit kết thúc, từ repo root đặt `APP_ENV=testing`, `SESSION_DRIVER=file`; chạy `php backend/tests/Browser/seed.php`. Seed có thể chạy lại, chỉ dùng miền `example.invalid`. Không chạy browser QA và PHPUnit đồng thời trên cùng database.
4. Chạy server fixture từ repo root: `php -S 127.0.0.1:8000 -t frontend/dist/travelgo/browser backend/tests/Browser/router.php`. Router này chỉ dùng cho test, không được triển khai làm router sản phẩm. Login fixture kiểm tra `APP_ENV=testing`, IP loopback, actor allowlist và dùng tài khoản demo đã seed. Route login không nằm trong bootstrap/routes production.
5. Cài Playwright ở thư mục công cụ riêng: `npm install --prefix ../travelgo-browser-tools --no-save playwright`. Đặt `TRAVELGO_PLAYWRIGHT_MODULE` thành **file URL tuyệt đối** tới `../travelgo-browser-tools/node_modules/playwright/index.mjs`; cần Chrome đã cài. Chạy `node frontend/tests/browser/moderation.mjs`. Script ghi lại năm ảnh và kiểm tra API thật, không mock route API.
6. Dừng server fixture sau kiểm tra. Chạy lại PHPUnit trước khi dùng schema test cho đợt kiểm tra tiếp theo. Các cookie, `.env.testing`, dependency và công cụ portable không được commit.

Trên Windows, một lần build bị EPERM khi dọn `dist` lúc server đang phục vụ thư mục đó. Đã dừng server và chạy lại build thành công. Browser QA được chạy lại trên bản build cuối sau sửa fetch và dữ liệu màn hình. Test browser này xác minh phiên fixture thật của Laravel; **chưa xác minh luồng đăng ký/đăng nhập thật** do Tuấn Hải phụ trách.

## Điều kiện trước khi chuyển khỏi Draft

- Review và tích hợp migration `places` PR #4 cùng schema reviews/photos của Hữu Hiếu; chạy lại migration production và test tích hợp, không dùng fixture để khẳng định đã merge.
- Chốt adapter `role` và việc hiển thị khả năng Chủ cơ sở với Tuấn Hải; kiểm tra login/logout và đổi tài khoản thật. Không thêm login thử vào ứng dụng.
- Tích hợp public place/review/photo resources và importer theo [hợp đồng](OWNER_MODERATION_API.md), xác minh danh mục ở trình duyệt/tài khoản khác và public aggregate sau ẩn bài.
- Chốt cách xử lý xung đột nguồn trong lúc materialize/khôi phục, phản hồi owner trong public API và phạm vi chọn bài đánh giá trên form.
- Mời Tuấn Hải review phần phiên/Angular và Hữu Hiếu review phần schema/đánh giá. Mã MAxx/Notion chưa có trong repo được giao; cần gắn đúng backlog khi nhóm cung cấp. Chưa đánh dấu task hoàn thành hoặc tự merge PR.
