# Task 2 — Địa điểm, Góc Địa Phương, yêu thích và đánh giá

- **Phụ trách** · Lê Nguyễn Hữu Hiếu
- **Nhánh** · `feat/places-reviews`
- **Đầu ra** · Migration bảng `places`, API danh sách và chi tiết địa điểm cho Khám phá và Góc Địa Phương, API yêu thích và đánh giá theo tài khoản, tích hợp vào các màn Angular hiện có.

## 1. Mở repo và đọc trước khi sửa

1. Clone [haiphamt/TravelGo](https://github.com/haiphamt/TravelGo) hoặc mở thư mục gốc của bản đã clone trong Codex. Chọn GPT-6.1 Sol Ultra nếu có. Đọc [rules.md](../rules.md), [mẫu PR](../.github/pull_request_template.md) và [hướng dẫn khung backend](BACKEND_FOUNDATION_TASK.md).
2. Chạy `git status --short` và `git fetch origin`. Chốt hợp đồng địa điểm trong lúc [PR khung Laravel/MySQL #3](https://github.com/haiphamt/TravelGo/pull/3) được review. Khi khung đã vào nhánh tích hợp, tạo nhánh từ mốc đó, ví dụ `git switch -c feat/places-reviews origin/feat/travelgo-frontend`. Nếu nhóm đã chuyển sang `main` có cả frontend và backend, dùng `origin/main`. Nếu nhánh task đã có, tiếp tục trên nhánh đó và kiểm tra mốc đang dùng.
3. Đọc `backend/README.md` sau khi khung được tích hợp. Nếu hướng dẫn task chưa có trên nhánh làm việc, đọc bằng `git show origin/docs/update-team-assignments:docs/PLACES_REVIEWS_TASK.md`. File hướng dẫn có thể đọc từ nhánh tài liệu, còn code làm trên nhánh task.
4. Đối chiếu `frontend/src/app/{catalog,data,discovery,explore,detail,store,review,logic}.ts`, `frontend/src/main.ts`, `frontend/public/data/{catalog,sources,osm-photo-sources}.json` và test `catalog`, `discovery` trong `frontend/tests/`. Xem màn `/kham-pha`, `/goc-dia-phuong`, `/yeu-thich` và chi tiết địa điểm. Tái sử dụng bố cục, component và trạng thái giao diện đã bàn giao.

## 2. Hợp đồng dùng chung

- **Hữu Hiếu** viết migration bảng `places` theo [quy ước mã địa điểm](../rules.md#mã-địa-điểm-dùng-chung). Trao đổi cột, khóa và trường có thể `null` với **Chung Minh Hiếu**, người phụ trách nhập danh mục. Bàn giao migration sớm để Minh Hiếu chạy thử phần nhập. Kiểm tra việc tra mã OSM có `/` qua API và liên kết chi tiết. Chia sẻ hợp đồng tra địa điểm cho Hân, Định và Huy.
- **Tuấn Hải** phụ trách phiên đăng nhập. Lấy tài khoản từ phiên đã xác thực. `users.id` là `BIGINT UNSIGNED` tự tăng. Có thể dùng fixture tài khoản trên MySQL test để làm trước phần yêu thích và đánh giá.
- **Triệu Quang Huy** phụ trách xét duyệt. Thống nhất cách API địa điểm nhận bản cập nhật đã duyệt, cách hiển thị phản hồi chủ cơ sở và cách lọc đánh giá hoặc ảnh bị ẩn. Dùng ID đánh giá/ảnh ổn định cho luồng báo cáo. Hữu Hiếu sở hữu bản ghi đánh giá và API viết/sửa của tác giả.

## 3. Thứ tự triển khai

1. **Địa điểm.** Viết migration bảng `places` và kiểm tra `public_id` duy nhất cùng quy tắc chống trùng theo nguồn. Sau đó làm danh sách và chi tiết theo dữ liệu TP.HCM. Bám bộ lọc đang hiển thị, tìm kiếm có dấu và không dấu, sắp xếp và phân trang có thứ tự ổn định. Khám phá và Góc Địa Phương dùng cùng hợp đồng địa điểm, có cách phân biệt hồ sơ Local. Nêu rõ cách trả trường thiếu, trường nguồn, ảnh có ghi công và trạng thái tham khảo. Giữ dữ liệu tìm quanh vị trí và bản đồ tương thích với mã, tọa độ thực tế và bộ lọc đang dùng. Dùng dữ liệu mẫu để làm API trước khi importer hoàn tất.
2. **Yêu thích.** Làm đọc, lưu và bỏ lưu theo tài khoản hiện tại. Hai lần gửi cùng yêu cầu thêm vẫn chỉ có một quan hệ tài khoản–địa điểm. Xử lý lỗi tải và ghi mà giao diện có thể báo lại.
3. **Đánh giá.** Một đánh giá cho mỗi tài khoản tại mỗi địa điểm, có thể chỉnh sửa, từ 1–5 sao. Bám ràng buộc ngày ghé, nhận xét và ảnh trong form hiện có. Xác thực nội dung ảnh và phạm vi quyền trên backend. Thống nhất dữ liệu nào được công khai và cách tính tổng số, điểm trung bình khi có đánh giá bị ẩn. Dữ liệu thiếu hoặc chưa được xác minh giữ đúng trạng thái nguồn.
4. **Nối Angular và bàn giao.** Sửa phần gọi API và ánh xạ dữ liệu trong phạm vi task, dùng template và CSS hiện có. Giữ các trạng thái tải, trống, lỗi, thiếu ảnh và thiếu địa chỉ. Công bố phương thức, đường dẫn, ví dụ request/response, giới hạn phân trang và mã lỗi trong PR.

## 4. Kiểm thử trước khi mở PR

| Phần | Tình huống cần kiểm tra |
| --- | --- |
| Địa điểm | Tìm có dấu/không dấu, lọc Local, kết hợp bộ lọc, phân trang, mã OSM có `/`, mã không tồn tại, trường địa chỉ/tọa độ/giá bị thiếu. |
| Yêu thích | Thêm lại không trùng, bỏ lưu, chưa đăng nhập và danh sách của hai tài khoản tách biệt. |
| Đánh giá | Tạo và sửa đánh giá của mình, từ chối tài khoản khác, điểm ngoài 1–5, vượt giới hạn ảnh hoặc sai kiểu tệp, gửi lại không tạo bản ghi trùng. Kiểm tra trạng thái đã kiểm duyệt khi tích hợp với nhánh của Huy. |
| Trình duyệt | Kiểm tra Khám phá → chi tiết → yêu thích/đánh giá và Góc Địa Phương trên desktop/mobile. Kiểm tra lỗi API và trạng thái trống. |

Viết Laravel Feature Test trong `backend/tests/Feature/` và unit test cho logic độc lập mới hoặc thay đổi. Chạy `php artisan test` trên MySQL test riêng. Nếu sửa Angular, chạy `npm test`, `npm run build` trong `frontend/` và dùng Playwright cho luồng liên quan khi bộ test chung đã sẵn sàng.

## 5. Prompt gửi Codex

```text
Tôi là Lê Nguyễn Hữu Hiếu, phụ trách Task 2 của haiphamt/TravelGo trên feat/places-reviews. Trước khi sửa, đọc rules.md, .github/pull_request_template.md, backend/README.md và docs/PLACES_REVIEWS_TASK.md. Nếu hướng dẫn chưa có trên nhánh, chạy git fetch origin rồi đọc bằng git show origin/docs/update-team-assignments:docs/PLACES_REVIEWS_TASK.md. Kiểm tra git status, nhánh tích hợp, backend đã merge và các màn Angular được liệt kê.

Viết migration bảng places theo quy ước mã địa điểm trong rules.md. Thống nhất các trường cần nhập với Chung Minh Hiếu và bàn giao migration sớm. Sau đó làm API danh sách/chi tiết, yêu thích và đánh giá theo nhiệm vụ trong file. Đọc phiên tài khoản do Tuấn Hải làm. Phối hợp với Triệu Quang Huy về bản cập nhật, phản hồi và nội dung bị ẩn. Nếu phụ thuộc chưa tích hợp, dùng fixture trong test và ghi phần còn chờ. Bám giao diện Didaune/TravelGo đã bàn giao, giữ bố cục và CSS.

Viết và chạy test theo checklist. Rà diff, ghi lệnh, số test, kết quả thực tế và phần chưa xác minh. Soạn PR theo mẫu repo để tôi đọc diff, chạy lại các bước chính, rồi commit, push và mở PR.
```

## 6. Mở PR và bàn giao

- Kiểm tra `git status --short`, `git diff --check`, `git diff --cached --check` và đọc toàn bộ diff trước khi commit. Kiểm tra `.env`, token, dữ liệu cá nhân và thay đổi ngoài phạm vi. Push `feat/places-reviews` rồi mở PR về nhánh tích hợp đã chốt. Dùng Draft nếu còn phần kiểm thử hoặc phụ thuộc chưa sẵn sàng. Có thể bàn giao API tra cứu trước trong PR riêng nếu nhóm cần dùng sớm.
- Tiêu đề gợi ý `feat(places): add place catalog, favorites and reviews`. Điền **Task liên quan** (link backlog nếu có), **Thay đổi / đầu ra** (API, migration, ánh xạ ID), **Kiểm tra và minh chứng** (lệnh, số test, kết quả thật và phụ thuộc), **Review** (người review và cách đã kiểm tra phần AI hỗ trợ).
- Mời ít nhất một thành viên khác review và mời Tuấn Hải xem phần tích hợp Angular. Cập nhật kết quả test sau chỉnh sửa, gắn link PR vào backlog và gửi hợp đồng mã địa điểm/API cho nhóm.
