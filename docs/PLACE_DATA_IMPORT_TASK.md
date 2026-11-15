# TravelGo — Nhập danh mục địa điểm vào MySQL

- **Phụ trách** · Chung Minh Hiếu
- **Nhánh** · `feat/place-data-import`
- **Nhánh tích hợp** · `feat/travelgo-frontend`
- **Đầu ra** · Một lệnh Artisan đọc danh mục có sẵn trong repo và nhập vào bảng `places`, kèm kiểm thử MySQL và hướng dẫn chạy lại.

## 1. Bắt đầu từ schema của Hữu Hiếu

1. Mở thư mục gốc [TravelGo](https://github.com/haiphamt/TravelGo) trong Codex và chọn GPT-6.1 Sol Ultra nếu có. Đọc [rules.md](../rules.md), [mẫu PR](../.github/pull_request_template.md), `backend/README.md` và [hợp đồng bảng `places`](https://github.com/haiphamt/TravelGo/blob/362b4508b5512f1cf42fac6499687944360a9b34/backend/docs/PLACES_SCHEMA.md). Đối chiếu migration thực tế trong [PR schema #4](https://github.com/haiphamt/TravelGo/pull/4).
2. Chạy `git status --short`, `git fetch origin` và tạo `feat/place-data-import` từ `origin/feat/travelgo-frontend` nếu nhánh chưa có. Nếu file task chưa có trên nhánh làm việc, đọc bằng `git show origin/docs/update-team-assignments:docs/PLACE_DATA_IMPORT_TASK.md`. Đọc bản `rules.md` mới nhất từ cùng nhánh tài liệu trong lúc PR tài liệu chờ merge.
3. Kiểm tra cột và khóa với Hữu Hiếu, đặc biệt `source_id`, trường `NULL`, các cột JSON và thời gian. Có thể viết lệnh nhập ngay. Nếu PR #4 còn mở, dùng migration trên nhánh của Hữu Hiếu để thử cục bộ. Sau khi #4 merge, cập nhật từ nhánh tích hợp, chạy test lại và kiểm tra diff PR chỉ gồm phần nhập dữ liệu. Khi PR #4 đã merge, dùng migration có sẵn trong nhánh tích hợp.
4. Công việc của Minh Hiếu là ánh xạ và nhập dữ liệu. Thay đổi schema cần trao đổi trong PR #4 hoặc với Hữu Hiếu nếu phát hiện dữ liệu thật cần cột khác. API địa điểm và phần nối Angular do Hữu Hiếu phụ trách.

## 2. Dữ liệu đầu vào

| File trong `frontend/public/data/` | Dùng để làm gì |
| --- | --- |
| `catalog.json` | Đọc `places[]`, lấy ID, tên, danh mục, vị trí, giờ bán, ảnh, sản phẩm, nguồn, hồ sơ Local và `referenceOnly`. `metadata` mô tả bộ dữ liệu. |
| `sources.json` | Tra nguồn theo `osm` hoặc `community-local`. Giữ ghi công, giấy phép, ngày nguồn và cờ về quyền tái sử dụng. |
| `osm-facets.json` | Tra `places[public_id]` để lấy tiện ích và `districts[public_id]` để lấy quận theo nguồn. |
| `osm-photo-sources.json` | Nối `images[]` qua `placeId`, đối chiếu đường dẫn ảnh, giữ tác giả, liên kết gốc và giấy phép của ảnh đã ghép. |

Bản danh mục lúc bàn giao có **7.507 hồ sơ đầu vào**, gồm 7.457 OSM và 50 hồ sơ Góc Địa Phương tham khảo. Đếm lại theo file thực tế lúc chạy, giải thích mọi chênh lệch trong PR. Dùng dữ liệu thật đã có trong repo để thử lệnh. File nguồn Local ghi nhận quyền tái sử dụng chưa xác nhận. Giữ nguyên các cờ và nguồn đó khi thử cục bộ, cũng như khi nhóm đưa dữ liệu vào phạm vi sử dụng đã thống nhất.

## 3. Ánh xạ và cách ghi

| Đầu vào | Ghi vào `places` |
| --- | --- |
| `osm:node/5922616527` | `public_id = osm:node/5922616527`, `source = osm`, `source_id = node/5922616527`. Áp dụng tương tự cho `way` và `relation`. |
| `tg-local-…` đang có | `public_id` và `source_id` giữ nguyên mã hồ sơ, `source = community-local`. Lấy cờ `local` và `reference_only` từ dữ liệu. |
| Thông tin có thể thiếu | Giữ `NULL` cho giá, giờ hoặc tọa độ thiếu. Giữ giá `0` nếu nguồn ghi `0`. Chuỗi địa chỉ “Chưa cập nhật địa chỉ” ánh xạ về `NULL` theo hợp đồng. |
| `updated`, `sourceUpdatedAt` và metadata | Ánh xạ lần lượt sang `data_updated_at`, `source_updated_at`. Chuẩn hóa thời gian có múi giờ về UTC và giữ dữ liệu nguồn trong metadata. `imported_at` ghi thời điểm nhập. |
| Ảnh và hồ sơ Local | Lưu đường dẫn tham chiếu, ghi công, giấy phép, nguồn ảnh và `local_profile` theo schema. Giữ JSON đã có và phân biệt danh sách rỗng với trường chưa biết. |

1. Tạo một lệnh Artisan có tên và cách chạy ghi rõ trong tài liệu backend, ví dụ `php artisan places:import`. Đọc file từ checkout hiện tại và xử lý rõ trường hợp thiếu file, JSON sai hoặc sai cấu trúc. Kiểm tra đầu vào cấp file trước khi ghi. Dùng file dữ liệu trong repo, nên có thể chạy lệnh khi máy không vào được trang OSM.
2. Kiểm tra từng hồ sơ trước khi ghi. Kiểm tra ID đúng dạng, tên và trường bắt buộc, `city = hcm`, danh mục đang hỗ trợ, tọa độ và giá hợp lệ, JSON nguồn và URL nguồn. Báo dòng lỗi bằng mã hồ sơ hoặc vị trí dòng, kèm lý do. Ghi rõ trong hướng dẫn cách lệnh xử lý dòng lỗi, số lỗi và trạng thái thoát. Phân biệt lỗi file với hồ sơ bị bỏ qua để người chạy biết phần nào đã ghi.
3. Tra theo cặp `(source, source_id)`. Nếu bản ghi đã tồn tại, giữ nguyên `id` và `public_id`, cập nhật các trường nội dung nhập từ nguồn. Nếu cùng cặp nguồn mang `public_id` khác, hoặc một `public_id` đã gắn với cặp nguồn khác, báo xung đột và giữ bản ghi hiện hữu. Kiểm tra cả trường hợp dữ liệu đầu vào bị trùng. Dùng ràng buộc duy nhất của MySQL để giữ dữ liệu nhất quán khi ghi hoặc chạy lại.
4. Báo số đã đọc, thêm, cập nhật, không đổi và bỏ qua. Giữ các địa điểm nằm ngoài tập nhập, ví dụ hồ sơ `tg-place-…` do TravelGo tạo. Việc chạy lại cùng dữ liệu giữ nguyên số hồ sơ và hai loại ID.

## 4. Kiểm thử và xác nhận bàn giao

| Kiểm thử | Kết quả mong đợi |
| --- | --- |
| Nhập OSM và Local | Mã đúng theo hợp đồng, tên tiếng Việt còn nguyên, giữ nguồn, cờ tham khảo và JSON hồ sơ. |
| Nối quận, tiện ích và ảnh | Ghép đúng `public_id` hoặc `placeId`. Hồ sơ thiếu thông tin bổ sung vẫn được xử lý theo quy tắc `NULL`/danh sách rỗng. |
| Dữ liệu lỗi | Bắt file thiếu, JSON sai, ID sai, dữ liệu trùng, danh mục sai, tọa độ sai và giá âm. Báo lý do, giữ các bản ghi hiện hữu khi xung đột. |
| Chạy hai lần | Số lượng và `id`/`public_id` của hồ sơ đã nhập ổn định. |
| Đổi nội dung nguồn | Bản ghi đúng cặp nguồn đổi nội dung và giữ nguyên hai ID. Hồ sơ TravelGo ngoài danh mục giữ nguyên. |

- Thêm PHPUnit Feature Test cho lệnh và dữ liệu ghi vào MySQL, unit test cho logic ánh xạ/kiểm tra tách riêng nếu có. Fixture tự tạo chỉ dùng trong test. Chạy `php artisan test` trên `travelgo_test` theo `backend/README.md`.
- Chạy lệnh hai lần với danh mục thật trên MySQL phát triển. Đối chiếu số lượng theo nguồn, so hai ID của một số hồ sơ, kiểm tra ít nhất một bản ghi thiếu dữ liệu và một bản ghi có thông tin nguồn ảnh. Ghi kết quả thật và phần chưa kiểm tra vào PR.
- Chạy `git diff --check` và `git diff --cached --check`. Rà diff để kiểm tra đúng phạm vi lệnh nhập, test và cách chạy. Giữ dữ liệu thử, `.env`, mật khẩu, `vendor/` và log có thông tin cục bộ ở ngoài phần commit.

## 5. Prompt gửi Codex

```text
Tôi là Chung Minh Hiếu, làm phần nhập danh mục địa điểm của haiphamt/TravelGo trên feat/place-data-import. Đọc rules.md, .github/pull_request_template.md, backend/README.md, docs/PLACE_DATA_IMPORT_TASK.md và hợp đồng backend/docs/PLACES_SCHEMA.md từ PR #4 của Hữu Hiếu. Nếu file task chưa có trên nhánh này, chạy git fetch origin rồi đọc git show origin/docs/update-team-assignments:docs/PLACE_DATA_IMPORT_TASK.md. Kiểm tra git status và kiểm tra migration places đã có trong nhánh tích hợp chưa.

Triển khai lệnh nhập theo file task. Dùng catalog.json và các file nguồn đi kèm trong repo, giữ mã công khai, metadata, trường NULL và cờ tham khảo. Khi ghi vào MySQL, đối chiếu theo source và source_id, giữ ID khi nhập lại, báo xung đột mã rõ ràng. Nếu migration còn ở PR #4, dùng nó để kiểm thử cục bộ, rồi cập nhật theo nhánh tích hợp sau khi merge. Ghi lại các câu hỏi schema để Minh Hiếu trao đổi với Hữu Hiếu. Giữ phạm vi ở phần nhập, test và hướng dẫn chạy.

Viết và chạy test theo checklist. Chạy lệnh hai lần với danh mục thật trên MySQL phát triển, kiểm tra số lượng/ID, rà diff và báo lệnh, kết quả thực tế, phần còn vướng. Soạn nội dung PR theo mẫu để tôi tự kiểm tra trước khi commit, push và mở PR.
```

## 6. Mở PR nhập dữ liệu

- Sau khi PR #4 merge, cập nhật `feat/place-data-import` từ nhánh tích hợp mới nhất và chạy test lại. Push nhánh rồi mở PR về `feat/travelgo-frontend`. Có thể dùng Draft nếu còn phần cần kiểm thử hoặc chờ cập nhật schema.
- Tiêu đề gợi ý `feat(data): import TravelGo place catalogue into MySQL`. Điền bốn mục trong [mẫu PR](../.github/pull_request_template.md): task và liên kết PR #4, các file nguồn và cách ánh xạ, lệnh chạy và số lượng từng lần nhập, người review và cách đã kiểm tra kết quả AI. Ghi mã `MAxx` hoặc link backlog khi có.
- Mời Hữu Hiếu review ánh xạ cột và cách giữ mã. Khi mở PR, gửi cho nhóm link PR, một lệnh chạy lại và số bản ghi theo nguồn để các nhánh API có thể kiểm tra với cùng bộ dữ liệu.

### Mẫu để điền sau khi chạy thử

```markdown
## Task liên quan

- Nhập danh mục TravelGo vào MySQL. Schema từ PR #4.
- Mã công việc hoặc link backlog nếu có.

## Thay đổi / đầu ra

- Lệnh nhập, các file nguồn đã dùng và cách đối chiếu source/source_id.
- Cách giữ public_id, xử lý xung đột và hồ sơ có dữ liệu thiếu.

## Kiểm tra và minh chứng

- Môi trường PHP/MySQL và lệnh đã chạy.
- Lần 1 — số đã đọc, thêm, cập nhật, không đổi và bỏ qua theo nguồn.
- Lần 2 — số liệu tương ứng, kết quả đối chiếu số bản ghi và ID.
- PHPUnit — số test, kết quả và giới hạn còn lại.

## Review

- Người review đề nghị — Lê Nguyễn Hữu Hiếu.
- Phần AI hỗ trợ và cách Minh Hiếu đã xác minh.
```
