# feat(itineraries): persist account trips and add mock suggestion previews

Nội dung bàn giao cho Draft PR của Quỳnh Hân. Các phụ thuộc tích hợp được liệt kê trong phần Review.

## Task liên quan

- Task 3 — Nguyễn Thị Quỳnh Hân, lịch trình thủ công và bằng AI.
- [Hướng dẫn Task 3](https://github.com/haiphamt/TravelGo/blob/5431943/docs/ITINERARIES_TASK.md). Bổ sung mã MAxx và link backlog thực tế khi nhóm cấp; chưa có thông tin để điền.
- Nhánh đích hiện tại: `feat/travelgo-frontend`. Nhánh này đang dựa thêm trên commit schema `places` `362b450` của Hữu Hiếu; chờ review/merge phụ thuộc trước khi hợp nhất lịch trình.

## Thay đổi / đầu ra

- API danh sách/chi tiết/tạo/cập nhật/xóa lịch trình của người đăng nhập; dùng session và CSRF, kiểm tra chủ sở hữu trên backend.
- Migration lịch trình và điểm ghé, FK tới tài khoản và `places.id`; payload dùng mã địa điểm công khai. Giữ thứ tự, giá trị chưa biết, snapshot và version. Lưu giao dịch để lỗi ghi điểm không làm mất kế hoạch cũ.
- Kiểm tra ngày/giờ, 1–5 điểm, trùng điểm, chi phí, ngân sách, ghi chú, ảnh bìa và địa điểm không tồn tại. Version cũ bị từ chối bằng 409.
- Luồng gợi ý mock từ danh mục server, có tùy chọn Local, ưu tiên tên/món chính và cân bằng danh mục theo frontend; bản xem trước chưa ghi lịch trình. Có interface để thay provider sau khi nhóm chọn. Người giao việc xác nhận tiếp tục mô phỏng khi nhóm chưa chọn provider/luồng sao chép.
- Adapter Angular cho các màn hiện có, giữ bản nháp khi lỗi, không tự nhập lịch trình demo vào tài khoản. Chế độ server bật bằng `frontend/public/itinerary-config.json`; mặc định demo trong lúc chờ auth/dữ liệu.
- Template chỉ thêm trạng thái lỗi vào vùng danh sách, nhãn mock vào phần xem trước và đổi câu mô tả lưu theo tài khoản ở `app.ts`/`trip.html` khi bật API. Giữ CSS, ảnh, bố cục và các nút hiện có.
- Bổ sung Playwright 1.65.1 và bộ test chạy lại được trong repo qua Laravel/MySQL thật. Router fixture đăng nhập chỉ có trong máy chủ kiểm thử opt-in, không đăng ký vào ứng dụng bình thường.
- Sửa thiếu hai entry `@emnapi/core` và `@emnapi/runtime` 1.11.3 trong package-lock để `npm ci` kiểm tra được. Thêm dependency kiểm thử Playwright; giữ nguyên phiên bản các thư viện đã có.
- Điều chỉnh test rollback schema places để gỡ/khôi phục bảng lịch trình phụ thuộc đúng thứ tự khóa ngoại.

Chi tiết request/response, cách bật API, cách chạy và phần cần đồng đội chốt: `backend/docs/ITINERARIES_API.md`.

## Kiểm tra và minh chứng

- Môi trường: PHP 8.3.36, Composer 2.11.2, MySQL Community Server 8.4.13, Node 24.21.0. Cấu hình và tài khoản database nằm ở `.env`/`.env.testing` cục bộ, đã được Git bỏ qua.
- `composer install` và `composer check-platform-reqs`: đạt. PHP có `pdo_mysql`, `fileinfo`, XML và các extension cần thiết.
- `php artisan migrate --force`: đạt trên `travelgo_dev`, gồm migration places của người phụ trách và migration lịch trình.
- `php artisan test --compact --no-ansi`: **35 passed, 134 assertions**, trên MySQL `travelgo_test`. Có test hai tài khoản, đầu vào sai, bảo toàn snapshot, version cũ, rollback khi ghi điểm thất bại, mock ID sai/trùng, từ khóa món chính/cân bằng loại địa điểm, provider lỗi/quá thời gian và router fixture không xuất hiện trong ứng dụng bình thường.
- `npm test`: **49 passed**. Bao gồm test adapter về CSRF, giữ draft, đổi tài khoản, public ID, preview, thông báo lỗi trường nhập và phản hồi sai định dạng.
- `npm ci --ignore-scripts --dry-run --no-audit --no-fund`: đạt kiểm tra lockfile. Cài thư viện thực tế bằng `npm install --ignore-scripts --package-lock=false` trước khi sửa thiếu entry trong lock; không mô tả dry-run là một lượt clean install thực tế.
- `npm run build`: đạt; còn cảnh báo initial bundle vượt mức warning và CommonJS Leaflet, không chạm CSS/map để xử lý ngoài task.
- `php vendor/bin/pint --dirty --test`: đạt. `git diff --check`: đạt.
- `npm run test:itineraries`: **6 passed**, Playwright/Edge headless, viewport 1440×1000 và 390×844. Request lịch trình thực sự qua Laravel, session cookie, CSRF và MySQL; tạo/sửa/reload, hai tài khoản riêng, không có CSRF bị từ chối, mất kết nối giữ draft qua reload rồi retry, preview chưa lưu và xác nhận lưu đều đạt. Danh mục frontend dùng cùng fixture demo có trong MySQL. Đăng nhập fixture tạo session test; chưa kiểm tra email/Google hoặc AI thật.
- Ảnh kết quả nằm trong `frontend/playwright-report`, mở bằng `npx playwright show-report`. Cách chạy và giới hạn schema test được ghi trong tài liệu API. Báo cáo/trace và các cấu hình cục bộ đều được Git bỏ qua; đính kèm ảnh cần thiết khi đăng PR.

## Review

- Người review cần mời: ít nhất một thành viên; Tuấn Hải xem session/CSRF và phần Angular; Hữu Hiếu xem phụ thuộc places. Công Định xem đề xuất payload sao chép khi nối task phòng.
- [x] Tự rà luồng, diff, dữ liệu thử, bộ test và bản dựng.
- [x] AI hỗ trợ triển khai API, adapter, test và tài liệu. Kết quả được kiểm tra bằng PHPUnit trên MySQL, node:test, build, Pint và Playwright desktop/mobile đi qua backend thật.
- [x] Hoàn thiện gợi ý có nhãn mô phỏng theo xác nhận của người giao việc khi provider chưa được chốt.
- [x] File môi trường thật, vendor và node_modules được Git bỏ qua.
- [ ] Chốt auth session/guard và kiểm tra đăng nhập thật với Tuấn Hải.
- [ ] Review/merge schema và nối danh mục MySQL/API địa điểm thật.
- [ ] Chốt phiên bản thay đổi được duyệt để nối hành vi cập nhật/giữ/thay điểm từ workflow demo. Kế hoạch hiện được giữ nguyên trong API khi thao tác chưa nối.
- [ ] Nhóm chọn provider AI rồi triển khai kết nối backend, timeout và cấu hình khóa cục bộ.
- [ ] Chốt quyền/payload sao chép kết quả phòng với Công Định; hiện chưa mở nguồn `room` ở API.
- [x] Người phụ trách đã cho phép commit, push và mở Draft PR để nhóm review.

Chưa đánh dấu task hoàn thành hoặc tuyên bố tích hợp end-to-end khi các phụ thuộc trên chưa được nhóm chấp nhận.
