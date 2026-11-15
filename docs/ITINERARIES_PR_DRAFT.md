# feat(itineraries): save account trips and copy room plans

## Task liên quan

- Task 3 — Nguyễn Thị Quỳnh Hân: lịch trình thủ công, bản xem trước gợi ý và lưu kết quả phòng sang lịch trình cá nhân.
- [Hướng dẫn Task 3](https://github.com/haiphamt/TravelGo/blob/5431943/docs/ITINERARIES_TASK.md). Chưa có mã MAxx/link backlog để điền.
- Base: `feat/travelgo-frontend`. Phụ thuộc schema places [PR #4](https://github.com/haiphamt/TravelGo/pull/4) tại `362b450` và lõi phòng của Công Định [PR #7](https://github.com/haiphamt/TravelGo/pull/7) tại `e70e380`. Giữ nguyên commit của đồng đội. Ưu tiên review/merge phụ thuộc trước; sau đó Git loại phần chung khỏi diff PR này.

## Thay đổi / đầu ra

Lịch trình lưu theo tài khoản trên Laravel/MySQL: tạo thủ công hoặc xem trước gợi ý mô phỏng, xác nhận lưu, mở lại và chỉnh sửa. Thành viên phòng đã chốt có thể dùng nút hiện có để lưu một bản cá nhân từ lịch trình nhóm; sửa bản cá nhân không thay kết quả phòng.

- CRUD kiểm tra chủ sở hữu, ngày/giờ, 1–5 điểm, trùng điểm, ngân sách/chi phí, ghi chú và ảnh bìa. Lưu header/điểm trong transaction; version cũ trả 409, lỗi gửi giữ bản nháp.
- Gợi ý dùng danh mục server qua provider mô phỏng có nhãn, không lưu trước khi xác nhận. AI thật chưa được nhóm chọn provider.
- `POST /api/itineraries/from-room` chỉ nhận `roomCode`, `roomRevision`; máy chủ đọc phòng và kiểm tra thành viên, trạng thái đã chốt, phiên bản. Đọc `itinerary ?? result`, giữ thứ tự, giờ, snapshot, dấu giữ thông tin cũ và null/0. Người sở hữu lấy từ session.
- Cùng tài khoản/phòng/phiên bản mở lại cùng bản, giữ chỉnh sửa cá nhân. Hai request đồng thời hoặc retry sau mất phản hồi không tạo trùng. Phiên bản phòng mới tạo bản mới; xóa bản cá nhân cho phép lưu lại phiên bản đó.
- Migration thêm `itinerary_room_copies` và cột nullable `itinerary_stops.kept_revision`. Không đổi migration places, không xóa lịch trình đang có. Chạy `php artisan migrate` sau schema phòng/lịch trình.
- Giải quyết xung đột `backend/bootstrap/app.php` để đăng ký cả hai nhóm route và `frontend/proxy.conf.json` để proxy `/api/**`.
- Nối nút lưu cá nhân hiện có, kiểm tra tài khoản trước khi gửi; cho chỉnh bản `source: room` qua API lịch trình. Sửa mở lại cùng bản gây trùng dòng trong danh sách và thống nhất giới hạn tên Unicode với phòng.
- Giữ bố cục/CSS/ảnh. Template chỉ đổi dữ liệu, quyền và thông báo như phần nối API. Bật server bằng `itinerary-config.json` với `storage: "api"`; mặc định demo trong lúc chờ auth/danh mục chung. Lỗi API không tự lưu thành công vào demo.
- Playwright chạy lại được qua Laravel/MySQL thật, fixture login chỉ nằm trong máy chủ kiểm thử opt-in. Thay đổi Playwright/lockfile từ phần bàn giao trước giữ nguyên phiên bản thư viện ứng dụng.

Hợp đồng/cách chạy: [API lịch trình](https://github.com/haiphamt/TravelGo/blob/feat/itineraries/backend/docs/ITINERARIES_API.md), [sao chép để Định review](https://github.com/haiphamt/TravelGo/blob/feat/itineraries/backend/docs/ROOM_ITINERARY_COPY.md).

## Kiểm tra và minh chứng

- PHP 8.3.36, MySQL Community Server 8.4.13, Node 24.21.0. PHPUnit/Playwright dùng riêng `travelgo_test`, kiểm tra schema/driver trước reset; không chạy hai bộ đồng thời.
- `php artisan test --compact --no-ansi`: **67 passed, 459 assertions**. CRUD, snapshot, quyền hai tài khoản, version cũ, dữ liệu sai, rollback khi ghi lỗi, provider mô phỏng và bốn ca hai PHP process đồng thời: gia nhập, đề xuất, chốt/bỏ phiếu, sao chép lặp.
- `npm test`: **62 passed**. Adapter kiểm tra CSRF, đổi tài khoản, tham chiếu nguồn phòng, retry, metadata và danh sách không trùng.
- `npm run build`: đạt; còn warning initial bundle **718.17 kB/700 kB** và Leaflet CommonJS.
- `npm run test:itineraries`: **8 passed**, desktop 1440×1000/mobile 390×844. Sáu ca tạo thủ công/preview/giữ draft và hai ca sao chép phòng dùng hai phiên cookie. Request đi qua proxy, session, CSRF, MySQL. Ca mất phản hồi cho máy chủ ghi xong trước khi ngắt, retry cùng UUID; mở lại/chỉnh thứ tự bản riêng và phòng giữ nguyên.
- Test rollback schema được cập nhật theo thứ tự khóa ngoại mới. Pint trên các file PHP thay đổi và `git diff --check` đạt.
- [Ảnh minh chứng sao chép](https://github.com/haiphamt/TravelGo/blob/feat/itineraries/docs/evidence/room-itinerary-copy/README.md). Báo cáo HTML/trace ở `frontend/playwright-report`, `frontend/test-results` cục bộ, đã được Git bỏ qua.

## Review

- Đã mời review trong PR. Tuấn Hải xem Angular/session/CSRF; Công Định xem hợp đồng sao chép và phần nối phòng; Hữu Hiếu xem schema/danh mục. Triển khai trong nhánh này chưa có nghĩa đồng đội đã duyệt hợp đồng.
- [x] Tự rà diff, ID địa điểm, quyền, giao dịch và kết quả kiểm thử thực tế.
- [x] AI hỗ trợ API, adapter, test, tích hợp, tài liệu; đã kiểm tra bằng PHPUnit/MySQL, node:test, build và Playwright.
- [x] Không commit file môi trường, mật khẩu, vendor, node_modules hoặc báo cáo cục bộ.
- [x] Luồng sao chép đã triển khai để review.
- [ ] Review/merge phụ thuộc, nghiệm thu hợp đồng sao chép với Định.
- [ ] Tuấn Hải nối đăng nhập thật; Hữu Hiếu/Minh Hiếu nối danh mục/importer/API đã duyệt.
- [ ] Hữu Hiếu/Quang Huy chốt trạng thái và phiên bản địa điểm được duyệt. Chỉnh thông thường giữ snapshot; cập nhật/giữ/thay điểm của workflow demo vẫn báo chờ hợp đồng khi bật API.
- [ ] Nhóm chọn nhà cung cấp AI trước khi nối AI thật; bản hiện tại có nhãn mô phỏng theo xác nhận của người giao việc.

Giữ Draft tới khi nhóm xác nhận các phụ thuộc tích hợp và review. Cập nhật PR Task 3 đang có, không mở PR trùng cho cùng phần lịch trình.
