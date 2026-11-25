# Task 5 — Đóng góp, quyền quản lý và xét duyệt

Phụ trách: Triệu Quang Huy. Nhánh `feat/owner-moderation`, tách từ `feat/travelgo-frontend` tại `f4406f5` sau PR #3. Đọc task tại [commit 5431943](https://github.com/haiphamt/TravelGo/blob/5431943/docs/OWNER_MODERATION_TASK.md). Giữ PR Draft cho đến khi các phụ thuộc dưới đây được tích hợp và review.

## Phụ thuộc và quyết định cần nhóm chốt

- **Hữu Hiếu:** migration `places` trong [PR #4](https://github.com/haiphamt/TravelGo/pull/4), cùng `reviews`/`review_photos` trên `feat/places-reviews-api` tại `7a522d9`. Không chép các migration đó vào migration production của Task 5. Bản sao phục vụ test nằm trong `tests/Fixtures/migrations`; `Tests\TestCase` chỉ đăng ký file fixture khi migration production cùng tên chưa có. Đây là fixture theo hợp đồng đề xuất, chưa phải xác nhận schema đã merge.
- **Tuấn Hải:** API dùng `web` session guard và CSRF, không thêm API đăng nhập hay thay migration `users`. Hiện adapter quản trị đọc `User::getAttribute('role') === 'admin'`; thiếu vai trò thì không có quyền quản trị. Test mới thêm cột role bằng migration fixture. Cần chốt adapter với nhánh auth trước merge.
- Một tài khoản Người dùng được gửi yêu cầu quản lý qua `/chu-co-so`. Chỉ `ownership_grants` đang hiệu lực mới cho phép sửa/phản hồi tại cơ sở cụ thể. Không dùng một vai trò `owner` chung để cấp quyền mọi cơ sở. Duyệt/thu hồi grant không tự sửa `users.role`; nhánh auth cần suy ra khả năng mở khu vực Chủ cơ sở từ grant hoặc thống nhất adapter vai trò. Chỉ admin xác thực mới có thể duyệt.
- API địa điểm của Hữu Hiếu cần trả `revision`, `moderation_status` theo adapter snapshot, dùng `visibleReply()` cho phản hồi đang hiệu lực và đồng bộ thay đổi theo thời gian trước khi trả dữ liệu nếu cần độ chính xác tới ranh giới. Danh sách công khai hiện vẫn thuộc nhánh API địa điểm. Task 5 cập nhật trực tiếp hàng canonical trong `places`, không tạo danh mục song song.
- Hữu Hiếu tiếp tục phục vụ `/api/review-photos/{id}` và loại `hidden_at` khỏi danh sách, ảnh và aggregate. Không dùng vị trí mảng ảnh làm khóa báo cáo. Importer cần phối hợp quyền sở hữu trường đã được duyệt trước khi ghi đè nội dung.

## Cài đặt

Lấy các migration production phụ thuộc ở trên trước khi chạy `php artisan migrate` trên database phát triển. Migration `2026_11_15_000200_create_moderation_tables.php` thêm `places.moderation_status` và các bảng `contributions`, `moderation_events`, `ownership_grants`, `moderation_place_states`, `owner_replies`. Không chạy migration fixture trên production. Khóa ngoại tài khoản/địa điểm dùng `BIGINT UNSIGNED`. Các tác giả/người xử lý có audit history dùng `restrictOnDelete`; cần thống nhất chính sách lưu lịch sử trước khi thêm xóa tài khoản vĩnh viễn.

Ảnh đóng góp dùng data URL JPG/PNG/WebP, tối đa 5 MiB sau giải mã và 60 triệu pixel, bắt buộc ghi công và xác nhận quyền. Máy chủ kiểm tra bytes và MIME thực. Ảnh đề xuất nằm trong yêu cầu riêng cho đến khi duyệt, sau đó lưu trong trường ảnh của địa điểm. Cấu hình `post_max_size >= 12M` cho JSON. Cách lưu file riêng thay vì data URL có thể thống nhất tiếp với API ảnh; không có file mồ côi từ thao tác DB thất bại.

Để chạy Angular phát triển: Laravel tại `127.0.0.1:8000`, `npm start` tại `frontend/`; proxy `/api/**` về Laravel. Production cần cùng origin cho Angular/API. Các write dùng `credentials: same-origin`, JSON, `Accept: application/json` và cookie `XSRF-TOKEN` đã URL decode trong header `X-XSRF-TOKEN`. `GET /api/moderation/session` là route web, tạo cookie CSRF cho phiên hợp lệ.

## API

Tất cả route dưới đây yêu cầu phiên. Danh tính lấy từ phiên; `actor`, `user_id`, `role`, `status` gửi trong body không cấp quyền. `context=owner` chỉ chọn luồng nghiệp vụ và vẫn phải kiểm tra grant.

| Method / đường dẫn | Hành vi |
| --- | --- |
| `GET /api/moderation/session` | `{data:{id,admin}}`; không đăng nhập trả 401. |
| `GET /api/contributions` | Yêu cầu của chính tài khoản; lọc `kind`, `status`, `page`, `per_page` (1–50, mặc định 24). |
| `GET /api/contributions/{uuid}` | Tác giả hoặc admin. Tài khoản khác nhận 404. |
| `POST /api/contributions` | Gửi mới; trả 201. Backend cấp UUID yêu cầu và `tg-place-<uuid>` ổn định cho địa điểm mới. |
| `PUT /api/contributions/{uuid}` | Tác giả bổ sung một yêu cầu `needs-info`; gửi lại toàn bộ draft cùng `expectedVersion`. Không đổi kind/place/đối tượng báo cáo. |
| `POST /api/contributions/{uuid}/withdraw` | Tác giả rút `pending` hoặc `needs-info`, body `{expectedVersion}`. |
| `GET /api/moderation/queue` | Chỉ admin; bộ lọc và phân trang như danh sách cá nhân. |
| `GET /api/moderation/overview` | Chỉ admin. `data.catalog` gồm `places`, `users`, `reviews` (công khai) và `favorites`. `data.topPlaces` gồm tối đa 5 địa điểm theo số đánh giá công khai giảm dần, sau đó theo điểm trung bình giảm dần và ID nội bộ. Mỗi mục trả `id`, `name`, `area`, `reviewCount` và `rating`. |
| `POST /api/moderation/{uuid}/decision` | Chỉ admin; `{expectedVersion,decision,reason,reportAction?}`. |
| `GET /api/moderation/place?id=...` | Snapshot canonical và `revision` SHA-256; mã có `/` truyền qua query đã encode. Đồng bộ thay đổi đã duyệt trong transaction. |
| `GET /api/moderation/reviews?placeId=...` | Tối đa 50 đánh giá hiện hành mới nhất cho form hiện có; ID ảnh ổn định và phản hồi hợp lệ. Không trả email hoặc đường dẫn file riêng. |
| `GET /api/owner/grants` | Chỉ các grant chưa thu hồi của tài khoản hiện tại. |
| `PUT /api/owner/reviews/{id}/reply` | `{reviewVersion,text}`; chỉ chủ cơ sở đang có grant tại đúng địa điểm. Text tối đa 500 ký tự; chuỗi rỗng xóa phản hồi. |

Ví dụ đóng góp mới:

```json
{"kind":"new","reason":"Thông tin đã đối chiếu.","hcmConfirmed":true,"patch":{"name":"Tên cơ sở","area":"Địa chỉ tại TP.HCM","category":"food","price":null}}
```

Ví dụ cập nhật (lấy `expectedRevision` từ endpoint snapshot):

```json
{"kind":"update","context":"owner","placeId":"osm:node/5922616527","expectedRevision":"<64 hex characters>","reason":"Đổi giờ bán.","change":"hours","patch":{"hours":"08:00–18:00"}}
```

Claim gồm `relationship=owner|representative`, `evidence`, `agreement=true`. Report gồm `reviewId`, `reviewVersion` bằng `updatedAt` UTC chuẩn của API và `photoId` tùy chọn. Ảnh phải thuộc đúng review/place và còn hiển thị. API kiểm tra lại toàn bộ trước quyết định. `reportAction=keep|hide-photo|hide-review` chỉ có hiệu lực khi duyệt báo cáo. Ẩn ảnh không ẩn cả bài; ẩn bài không xóa nội dung hoặc thay phiên bản tác giả.

Response yêu cầu giữ shape `WorkflowRequest` của Angular, bổ sung `version`, `reviewId`, `photoId`, `currentReview`. `before`, `baseRevision` và `reportSnapshot` do backend tạo. History có actor, ID người xử lý, status, reason, version và thời điểm UTC. Danh sách có `{data:[],meta:{current_page,last_page,per_page,total}}`.

## Trạng thái và tính nhất quán

`pending → approved|rejected|needs-info|withdrawn`; `needs-info → pending|withdrawn`; chỉ claim `approved → revoked`. Các trạng thái khác không cho lặp quyết định. Mọi write vào yêu cầu hiện có cần đúng `expectedVersion`; xung đột trả 409, không áp dụng lần hai.

Mọi thao tác liên quan cơ sở khóa hàng `places` trước khi khóa yêu cầu/đánh giá. Duyệt cập nhật, trạng thái yêu cầu, history và grant/ẩn nội dung nằm trong cùng transaction MySQL, retry deadlock tối đa ba lần. Test mô phỏng lỗi ghi history chứng minh thay đổi công khai cũng rollback. Thu hồi grant đồng thời từ chối các yêu cầu `pending`/`needs-info` gửi từ khu vực owner tại cơ sở đó; đóng góp từ khu vực Người dùng giữ nghiệp vụ thông thường.

Revision fingerprint bao gồm toàn hàng canonical, nên importer hoặc API sửa nội dung cũng làm đề xuất cũ xung đột. Admin yêu cầu bổ sung để tác giả đọc lại bản hiện hành. Thay đổi giờ bán/chuyển hẳn ghi trực tiếp canonical sau duyệt. Chuyển tạm/tạm nghỉ lưu baseline và chỉ materialize trong khoảng hiệu lực. Thứ tự áp dụng theo ID audit event, kể cả hai quyết định có cùng timestamp. Không duyệt chồng khi cơ sở đã có thay đổi tạm chưa hết hoặc thay đổi sắp hiệu lực.

Thời gian không có offset hiểu theo `Asia/Ho_Chi_Minh`; lưu UTC. Khoảng hiệu lực bao gồm đầu, loại trừ cuối. Chạy `php artisan moderation:reconcile` hoặc scheduler `php artisan schedule:work`; lịch đã đăng ký mỗi phút, không chạy chồng. API snapshot và timer của màn moderation cũng đồng bộ ở ranh giới. Public API muốn hiệu lực chính xác tại mỗi request cần gọi adapter đồng bộ trước đọc; scheduler riêng có độ trễ tối đa một chu kỳ.

Nếu có ghi ngoài moderation làm fingerprint khác trong lúc cần materialize/khôi phục, command trả lỗi và giữ dữ liệu mới thay vì ghi đè. Cần người phụ trách dữ liệu đối chiếu baseline trước khi chạy lại; chưa có màn giải quyết xung đột nguồn này. Không tự reset baseline vì có thể làm mất thay đổi tạm đang cần khôi phục.

## Angular và phần còn chờ

Ba route `/dong-gop`, `/chu-co-so`, `/quan-tri` có guard phiên; admin route kiểm tra khả năng admin từ máy chủ. API cũng kiểm tra độc lập. Store tải danh sách cá nhân/hàng chờ, grant, snapshot và đánh giá thật. Không chuyển lỗi sang IndexedDB. Phiên hết hạn/đổi tài khoản xóa state riêng; trước write kiểm tra lại phiên. Nếu máy chủ đã commit mà reload lỗi, trả trạng thái đã lưu để tránh gửi lại quyết định.

Giữ cấu trúc, CSS, ảnh và điều hướng. Template được chạm chỉ để cập nhật thông tin lưu trên máy chủ và nhãn bỏ chữ “thử”; các component thay nguồn dữ liệu. `revision` máy chủ ưu tiên revision demo; `tg-place-*` được giữ khi phục hồi tham chiếu lịch trình. Dữ liệu moderation cũ trong IndexedDB không còn quyết định quyền hoặc phép chiếu danh mục. Snapshot đã tải được đưa vào cache công khai để xem kết quả ngay sau duyệt; tải lại toàn danh mục ở trình duyệt khác cần nhánh API địa điểm tích hợp.

Các mục chưa xác minh chung: đăng nhập/đăng xuất thật của Tuấn Hải; migration/API/ảnh và importer của Hữu Hiếu/Minh Hiếu được merge; public review resource gọi `visibleReply()` và public place resource trả trạng thái/revision; luồng chọn nhiều bài đánh giá trên form (form hiện có hiển thị bài hiện hành đầu tiên); giải quyết xung đột importer nêu trên. Địa điểm mới xuất bản khi duyệt, chưa hỗ trợ hẹn xuất bản mới trong tương lai (API từ chối duyệt trường hợp này). Các cập nhật địa điểm hiện có hỗ trợ lịch hiệu lực.

AI/Codex hỗ trợ triển khai backend, adapter Angular và test; kết quả kiểm tra thực tế ở [OWNER_MODERATION_VALIDATION.md](OWNER_MODERATION_VALIDATION.md). Hợp đồng với đồng đội là đề xuất để review, không tuyên bố đã được đồng đội chấp thuận.
