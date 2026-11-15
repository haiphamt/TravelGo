# Bàn giao schema places — Task 2, PR đầu

Người phụ trách: **Lê Nguyễn Hữu Hiếu**. Nhánh: `feat/places-reviews`.
Base hiện tại: `feat/travelgo-frontend` tại `f4406f5`, đã merge backend PR #3.
Đối chiếu quy tắc mới tại `5431943` trên `origin/docs/update-team-assignments`.

Đây là hợp đồng đề xuất cùng migration để **Chung Minh Hiếu review và lấy viết importer trên `feat/place-data-import`**. Chưa xác nhận rằng Minh Hiếu đã đồng ý các cột. PR này chỉ tạo bảng và kiểm thử schema; không nhập danh mục, không thêm endpoint hoặc thay giao diện.

## Khóa và định danh

| Cột | Kiểu MySQL | NULL | Cách dùng |
| --- | --- | --- | --- |
| `id` | BIGINT UNSIGNED AUTO_INCREMENT | Không | Khóa nội bộ. Các bảng nghiệp vụ dùng `foreignId('place_id')->constrained('places')`. |
| `public_id` | VARCHAR(80), ASCII binary, UNIQUE | Không | Mã công khai giữ nguyên theo rules. API sau này trả ở `id`, payload dùng `placeId`. |
| `source` | VARCHAR(32), ASCII binary | Không | Giữ ID nguồn trong manifest: `osm`, `community-local`; bản tạo mới `travelgo`, fixture `demo`. |
| `source_id` | VARCHAR(128), ASCII binary | Không | OSM gồm loại và số (`node/5922616527`); Local giữ nguyên `tg-local-<uuid>`; TravelGo giữ `tg-place-<uuid>`. |

`UNIQUE(source, source_id)` chống trùng khi nhập lại. OSM `node/123`, `way/123`, `relation/123` là ba hồ sơ khác nhau. Không dùng tên/tọa độ làm khóa gộp. Các chuỗi mã phân biệt hoa/thường; importer/API phải kiểm tra đúng dạng viết thường theo rules, không tự sửa mã của hồ sơ đã tồn tại.

Không cập nhật `id`, `public_id`, `source`, `source_id` khi đổi tên, giờ bán hoặc vị trí cùng địa điểm. Importer tra theo cặp nguồn trước, cập nhật các cột nội dung trên bản ghi cũ; không thay mã công khai khi upsert. Không dùng upsert theo tất cả unique index rồi ghi đè `public_id` nếu đầu vào xung đột: báo lỗi dòng đó.

## Cột nội dung và ánh xạ từ Angular

Các tên bên trái là SQL; tên camelCase bên phải là payload hiện có trong `frontend/src/app/data.ts`.

| Cột | Kiểu / NULL / mặc định | Ánh xạ và quy tắc |
| --- | --- | --- |
| `name` | VARCHAR(255), bắt buộc | `name`, tiếng Việt UTF-8. |
| `city`, `category` | VARCHAR(32), bắt buộc | `city`, `category`; importer cần kiểm tra `hcm` và sáu danh mục hiện có. Không lưu `all`. |
| `local` | BOOLEAN, bắt buộc, false | `local`; đây là phân loại Góc Địa Phương, không suy ra từ tên. |
| `area` | TEXT, NULL | `area`; chuỗi mẫu “Chưa cập nhật địa chỉ” được lưu NULL. Adapter API sau này phục hồi placeholder để giữ UI. |
| `source_district` | VARCHAR(80), NULL | `sourceDistrict`, lấy từ `osm-facets.json`, không suy đoán từ địa chỉ. |
| `price` | DECIMAL(14,2), NULL | `price`, VND tham khảo; CHECK >=0; 0 khác NULL. Không tự suy ra từ mô tả. |
| `hours`, `description` | TEXT, NULL | `hours`, `description`; giờ nguồn có chuỗi 291 ký tự. Giữ nguyên cách mô tả, không coi là xác nhận đang mở. |
| `lat`, `lng` | DECIMAL(10,7), NULL | `lat`, `lng`; CHECK lần lượt [-90,90] và [-180,180]. Cho phép từng tọa độ thiếu như parser hiện có; không điền tọa độ thay thế. |
| `image`, `photo_credit` | TEXT, NULL | `image`, `photoCredit`; không tự ghép ảnh chưa có quyền sử dụng. |
| `images`, `products`, `facets` | JSON, NULL | Danh sách hiện có; `facets` từ sidecar. Khi đã biết danh sách rỗng thì lưu `[]`; NULL là chưa có dữ liệu. API ánh xạ NULL danh sách sang `[]` khi cần. |
| `photo_source` | JSON, NULL | Giữ `photoSource`: `url`, `license`, `licenseUrl`; chỉ có khi ảnh có nguồn/ghi công. |
| `local_profile` | JSON, NULL | Giữ nguyên `localProfile`, gồm nguồn, phân loại, lịch theo thứ, qualityFlags, collectedAt/preparedAt/observedAt riêng biệt. |
| `mobile` | BOOLEAN, NULL | Thuộc tính `mobile` tùy chọn; thiếu thì NULL. |
| `source_url` | TEXT, NULL | `sourceUrl`; importer/API kiểm tra HTTPS và nguồn hợp lệ. |
| `source_label`, `source_license` | VARCHAR(255), NULL | `sourceLabel`, `sourceLicense`; giữ nguyên giới hạn quyền dùng lại của Local. |
| `source_updated_at` | DATETIME(6), NULL | `sourceUpdatedAt`, chuẩn hóa UTC khi nhập, giữ microsecond. |
| `data_updated_at` | DATETIME(6), NULL | `updated` của dữ liệu nguồn, không nhầm `updated_at` Laravel. |
| `imported_at` | DATETIME(6), NULL | Thời điểm importer thực sự đọc/ghi hồ sơ, UTC; không phải xác minh thực địa. |
| `source_metadata` | JSON, NULL | Metadata nguồn liên quan từ `sources.json`, `catalog.metadata`, và minh chứng ảnh từ `osm-photo-sources.json`; giữ thời điểm, tác giả, giấy phép, cờ tham khảo. Không lưu secret. |
| `reference_only` | BOOLEAN, bắt buộc, true | `referenceOnly`; mặc định bảo toàn trạng thái tham khảo, không mặc định đã xác minh. |
| `created_at`, `updated_at` | TIMESTAMP, NULL | Thời điểm ghi DB do Laravel/importer quản lý, không thay thế ngày nguồn. |

Index `(city, local, category, id)` hỗ trợ lọc và thứ tự phân trang ổn định theo ID nội bộ. Các cấu trúc JSON giữ payload danh mục đang bàn giao, không thay thế bảng đánh giá/ảnh đánh giá cần ID ổn định ở PR sau. Chưa tạo điểm trung bình hoặc số đánh giá giả.

Schema kiểm tra kiểu/NULL/unique/JSON/phạm vi tọa độ và giá. Quy tắc định dạng ID, trường không rỗng, HTTPS, danh mục và cấu trúc bên trong JSON phải được importer/API xác thực trước khi ghi; PR schema không tuyên bố đã có lớp xác thực đó.

## Trình tự chạy cho Minh Hiếu

1. Review các cột trên, nhất là `source=community-local`, `source_id`, JSON và trường NULL. Chốt trong PR trước khi importer phụ thuộc schema này.
2. Lấy migration `2026_11_15_000000_create_places_table.php` từ PR schema; chạy `php artisan migrate` trên MySQL phát triển theo `backend/README.md`.
3. Đọc `catalog.json` cùng `sources.json`, `osm-facets.json`, `osm-photo-sources.json`. Chỉ đọc catalog sẽ làm mất bộ lọc quận/tiện ích và metadata ảnh hiện có.
4. Kiểm tra dữ liệu trước ghi; lỗi dòng nào cần báo mã và lý do. Chạy importer hai lần và xác minh số hồ sơ/ID không tăng hoặc đổi sai. Importer và test nhập lại thuộc PR của Minh Hiếu; test ở đây chỉ chứng minh schema cho phép update theo cặp nguồn.
5. Không nhập toàn bộ danh mục hoặc chạy test reset vào DB thật. PHPUnit dùng schema riêng `travelgo_test`, kiểm tra driver/tên DB và từ chối MariaDB trước khi migrate.

## Ranh giới với các PR tiếp theo

- **API địa điểm:** danh sách/chi tiết, tìm có dấu và không dấu, bộ lọc, thứ tự ổn định, phân trang, NULL và metadata. Hợp đồng dự kiến cho mã có `/`: `GET /api/places/detail?id=osm%3Anode%2F5922616527`; đây chưa phải endpoint đã tồn tại. Kiểm tra liên kết chi tiết Angular ở PR nối API.
- **Angular:** `trip-storage.ts::validPlaceId` chưa nhận `tg-place-<uuid>`. Bổ sung và test trong PR tích hợp API, giữ template/CSS hiện có. PR schema không đổi frontend.
- **Tuấn Hải:** nhánh tích hợp hiện chưa có API đăng nhập hoặc Sanctum. Lấy tài khoản từ phiên xác thực khi làm yêu thích/đánh giá; fixtures chỉ dùng trong test. `users.id` đã là BIGINT UNSIGNED.
- **Quang Huy:** chốt cách áp dụng cập nhật đã duyệt, phiên bản địa điểm/đánh giá, ID đánh giá/ảnh ổn định, ảnh/bài bị ẩn và owner reply. Không dùng chỉ số ảnh trong demo làm ID công khai. Tính aggregate từ đánh giá còn hiển thị.
- **Quỳnh Hân/Công Định:** FK dùng `places.id`; API/payload dùng `public_id`. Thay đổi vị trí giữ nguyên cả hai mã. Hiện chưa có API tra cứu để các bạn gọi.

Sau khi PR schema được review và merge, các bước API/yêu thích/đánh giá được thực hiện ở PR tiếp theo; không gom vào PR bàn giao bảng này.
