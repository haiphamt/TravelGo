# Phòng cùng đi — bàn giao Task 4

Phạm Công Định triển khai trên `feat/trip-rooms`, lấy gốc từ nhánh tích hợp `feat/travelgo-frontend` tại `f4406f5`. Phần này lưu phòng trên Laravel/MySQL và nối màn Phòng cùng đi đã bàn giao. Quyền chủ phòng được xác định theo tài khoản và từng phòng, không theo vai trò Chủ cơ sở hay Quản trị viên.

## Phần đã triển khai

- Tạo phòng với mã mời do máy chủ sinh; tham gia lại giữ nguyên quan hệ thành viên. Phòng hỗ trợ tối đa 12 thành viên và 12 đề xuất.
- Thành viên đề xuất địa điểm khi phòng đang chuẩn bị. Chủ phòng có thể bỏ đề xuất, mở bình chọn và chốt từ 1 đến 5 điểm theo thứ tự đã chọn.
- Mỗi thành viên thay hoặc rút phiếu của chính mình trong lúc đang bình chọn. Máy chủ lấy tài khoản từ phiên đăng nhập, không nhận người bỏ phiếu từ dữ liệu gửi lên.
- Kết quả chốt giữ nguyên khi gọi lại hoặc chỉnh lịch trình nhóm. Lịch trình đang chỉnh được lưu riêng; phiên bản `revision` ngăn một tab cũ ghi đè cập nhật mới.
- Mỗi thao tác thay đổi khóa hàng của phòng trong cùng giao dịch với kiểm tra trạng thái và ghi dữ liệu. Khóa duy nhất và khóa ngoại bảo vệ quan hệ thành viên, đề xuất và phiếu.

Hành vi theo màn phòng hiện tại: có thể gia nhập trong giai đoạn chuẩn bị hoặc bình chọn; không thêm người mới sau khi chốt. Kết quả do chủ phòng chọn, không tự áp dụng đồng thuận tuyệt đối hoặc một cách xử lý đồng hạng mới. Số điểm mong muốn là thông tin dự kiến; giới hạn kết quả vẫn là 5.

## Phụ thuộc và phần còn chờ

1. **Bảng places:** migration `2026_11_15_000000_create_places_table.php` được lấy nguyên trạng từ `origin/feat/places-reviews` tại `362b4508b5512f1cf42fac6499687944360a9b34` để chạy và kiểm thử khóa ngoại. Đây là migration của Hữu Hiếu, chưa phải xác nhận nhóm đã duyệt schema. Khi migration đó được hợp nhất, Git giữ cùng một tệp; không tạo bảng places lần thứ hai. Phần phòng cần được rà lại với schema cuối trước khi merge.
2. **Đăng nhập:** nền hiện có dùng guard `web`. Route phòng sử dụng phiên đăng nhập Laravel và CSRF, không thêm API đăng nhập, tài khoản giả hoặc cách đổi vai trong production. Chờ nối giao diện đăng nhập của Tuấn Hải; nếu nhóm chọn middleware khác, thống nhất lại tại một điểm đăng ký route. Test sử dụng tài khoản trong database test và `actingAs`; kiểm tra trình duyệt sử dụng phiên cookie riêng qua bộ hỗ trợ chỉ chạy cục bộ ngoài repo.
3. **Địa điểm và xét duyệt:** máy chủ tra `places.public_id`, lưu FK bằng `places.id`; hiện kiểm tra hồ sơ tồn tại và thuộc `hcm`. Schema được bàn giao chưa có trường ẩn/đóng cửa. `RoomPlaceCatalog` là điểm cần nối chính sách hiển thị cuối cùng với Hữu Hiếu/Quang Huy. Angular vẫn dùng danh mục được bàn giao; một điểm chưa nhập vào MySQL sẽ bị từ chối, không tự tạo bản ghi hoặc điền dữ liệu giả.
4. **Lịch trình cá nhân:** chưa có hợp đồng API được Quỳnh Hân xác nhận. Ở chế độ API, giữ nút hiện có nhưng chưa cho lưu; không ghi một bản cục bộ rồi coi đó là lịch trình đã lưu theo tài khoản. Hợp đồng đề xuất để trao đổi nằm ở cuối tài liệu này.

Không đánh dấu toàn bộ Task 4 hoàn thành hoặc merge khi các phụ thuộc ảnh hưởng nghiệm thu vẫn chưa được nhóm xác nhận. Chưa có mã MAxx/link backlog được cung cấp; dùng tên Task 4 và người phụ trách, không tự đặt mã.

## Đường dẫn và phiên làm việc

Tất cả đường dẫn dưới đây cùng origin với Angular. `GET /api/rooms/csrf` mở phiên và trả cookie CSRF; các yêu cầu ghi gửi `X-XSRF-TOKEN` đọc từ cookie `XSRF-TOKEN`. Giữ `Accept: application/json`. Route nghiệp vụ yêu cầu đăng nhập, có giới hạn tần suất và không bỏ qua CSRF. Middleware phòng kế thừa kiểm tra guard của Laravel, trả JSON 401 cho khách kể cả khi thiếu Accept; không phụ thuộc trang đăng nhập HTML chưa có.

| Phương thức | Đường dẫn | Dữ liệu gửi |
| --- | --- | --- |
| GET | `/api/rooms` | Danh sách phòng của tài khoản hiện tại. |
| POST | `/api/rooms` | `title`, `date` (chuỗi ngày hoặc null), `desiredStops` 1–5; `name` tùy chọn là tên hiển thị trong phòng. |
| POST | `/api/rooms/join` | `code`, `name` tùy chọn. |
| GET | `/api/rooms/{code}` | Chi tiết phòng, chỉ thành viên được đọc. |
| POST | `/api/rooms/{code}/places` | `placeId` là mã công khai nguyên vẹn. |
| DELETE | `/api/rooms/{code}/places` | JSON `placeId`; chỉ chủ phòng, trước bình chọn. |
| POST | `/api/rooms/{code}/voting` | Chỉ chủ phòng mở bình chọn. Gọi lại khi đang bình chọn trả trạng thái hiện tại. |
| PUT | `/api/rooms/{code}/votes` | `placeIds`: toàn bộ lựa chọn của chính người đăng nhập; `[]` để rút phiếu. |
| POST | `/api/rooms/{code}/decision` | `placeIds`: 1–5 mã theo thứ tự ghé. Gọi lại sau khi chốt trả kết quả đã lưu. |
| PUT | `/api/rooms/{code}/itinerary` | `revision`, `stops` gồm 1–5 mục với `placeId`, `time` HH:mm; `refreshSnapshot` và `keptRevision` tùy chọn. |

`keptRevision` chỉ là dấu ghi nhận lựa chọn giữ thông tin cũ của chủ phòng, không phải bằng chứng dữ liệu nguồn đã được xác minh. Tên, giá và snapshot không được lấy từ payload; máy chủ đọc dữ liệu địa điểm hoặc giữ snapshot đã lưu.

Ví dụ mở phòng:

```json
{"title":"Một ngày khám phá Sài Gòn","date":"2026-12-01","desiredStops":3,"name":"Định"}
```

Phản hồi một phòng có dạng `{ "data": { ... } }`; danh sách là `{ "data": [ ... ] }`. Phòng gồm `code`, `title`, `date`, `desiredStops`, `ownerId`, `activeMemberId`, `phase`, `revision`, `votingOpened`, `members`, `places`, `votes`, `result` và `itinerary`. ID tài khoản trả dạng chuỗi để không mất độ chính xác của BIGINT trong JavaScript. `activeMemberId` luôn là tài khoản được xác thực ở máy chủ.

Một điểm kết quả có dạng:

```json
{"placeId":"osm:node/5922616527","name":"Tên từ hồ sơ địa điểm","time":"08:00","snapshot":{"name":"Tên từ hồ sơ địa điểm","area":"Chưa cập nhật địa chỉ","lat":null,"lng":null,"hours":null,"price":null,"status":null}}
```

Tên ví dụ minh họa cấu trúc, không phải dữ liệu để nhập. Giữ null cho giá, tọa độ và giờ chưa biết. Thứ tự mảng `result` là thứ tự đã chốt; `itinerary` là bản chỉnh riêng, có thể null trước lần chỉnh đầu tiên.

| HTTP | Tình huống |
| --- | --- |
| 401 | Chưa đăng nhập hoặc phiên hết hiệu lực. |
| 403 | Không phải thành viên hoặc thao tác dành cho chủ phòng. |
| 404 | Mã phòng không tồn tại hoặc định dạng đường dẫn sai. |
| 409 | Phòng đầy, trạng thái không còn phù hợp hoặc phiên bản lịch trình cũ. |
| 419 | Token CSRF không hợp lệ; không tự ghi lại yêu cầu thay đổi. |
| 422 | Trường nhập sai, đề xuất trùng, vượt giới hạn hoặc mã địa điểm không hợp lệ. |

## Nối Angular và giữ giao diện

`RoomApiClient` gửi JSON/cookie/CSRF và kiểm tra phản hồi. `RoomGateway` giữ trạng thái máy chủ, làm mới mỗi 5 giây khi màn đang hiển thị và không ghi đè một phản hồi mới bằng lượt tải cũ. Lỗi phiên đăng nhập xóa dữ liệu phòng khỏi màn; không tự chuyển sang dữ liệu demo. Không đổi CSS chung, hình ảnh, điều hướng hoặc bố cục màn phòng.

Template chỉ đổi dữ liệu, thông báo phiên/phòng, trạng thái lỗi, tên nút mời và điều kiện quyền. Bộ chọn vai thử vẫn ở đúng vị trí nhưng chỉ đọc trong chế độ API; tên đang thao tác do máy chủ trả. Thành viên có thể gửi đề xuất trước bình chọn. Cơ chế prototype cũ còn trong component để có thể dùng `REMOTE_ROOMS=false` qua DI trong bản frontend độc lập; không bật bằng tham số URL và không dùng làm cách né lỗi xác thực.

Angular local có `proxy.conf.json` chuyển `/api/**` tới `http://127.0.0.1:8000`. Khởi động Laravel trên cổng đó và chạy `npm start` trong frontend. Không nhập session thử vào IndexedDB để thay tài khoản đăng nhập.

## Kiểm tra trên máy thành viên

Làm theo `backend/README.md` để cài PHP phù hợp, Composer và MySQL. Tạo `.env`/`.env.testing` cục bộ và khóa ứng dụng; dùng schema `travelgo_test` riêng, không dùng dữ liệu thật. Phải có migration places nêu trên trước migration phòng.

```sh
cd backend
composer install
composer check-platform-reqs
php artisan test
php vendor/bin/pint --test --dirty
```

Các Feature Test phòng kiểm tra database/driver và từ chối schema khác hoặc MariaDB trước khi migrate. Kiểm thử đồng thời chạy hai PHP process, giữ khóa hàng phòng ở kết nối cha rồi thả để kiểm tra tranh chấp lượt cuối, đề xuất trùng và phiếu đến lúc chốt.

```sh
cd frontend
npm ci
npm test
npm run build
```

Máy kiểm tra ngày 15/11/2026 có npm 12; `npm ci` của phiên bản đó báo thiếu hai mục optional trong lockfile. `npx --yes npm@11.6.2 ci --no-audit --no-fund` cài được đúng lockfile. Không nâng phiên bản thư viện hoặc sửa lockfile để xử lý riêng lỗi công cụ này.

## Đề xuất trao đổi với Quỳnh Hân

Chưa coi là hợp đồng đã chốt: API lịch trình nhận danh sách điểm từ `itinerary ?? result` theo đúng thứ tự, kèm `placeId`, `time`, snapshot và lựa chọn giữ thông tin cũ khi có. Tên chuyến đi/ngày gợi ý từ phòng; người lưu được lấy từ phiên đăng nhập. Máy chủ lịch trình phải đọc phòng và kiểm tra tư cách thành viên, không tin snapshot do trình duyệt tự gửi. Hai bên cần thống nhất đường dẫn, cách xử lý điểm không còn hợp lệ, việc sao chép lặp và ID lịch trình trả về trước khi bật nút lưu bản cá nhân.

Tham khảo framework: [Laravel session authentication](https://laravel.com/docs/13.x/authentication), [database transactions](https://laravel.com/docs/13.x/database), [HTTP testing](https://laravel.com/docs/13.x/http-tests). AI hỗ trợ triển khai; người nhận task cần xem diff, chạy lại kiểm thử và hiểu luồng quyền/giao dịch trước khi gửi review.


## Cập nhật sau lượt rà soát 15/11/2026

Payload danh sách phải có chỉ số tuần tự; phản hồi lịch trình được kiểm tra đầy đủ trước khi nhận. Giới hạn nhãn thống nhất theo ký tự Unicode; tên hồ sơ rỗng yêu cầu nhập tên hiển thị. Phiếu nháp được xóa khi đổi phòng/tài khoản. Lỗi 5xx chỉ hiển thị thông báo phù hợp cho người dùng.

Đã đối chiếu nhánh feat/itineraries (09f8535) và feat/places-reviews-api (7a522d9). API lịch trình hiện chưa bật source room theo tài liệu của Quỳnh Hân, nên phần sao chép vẫn chờ hai bên xác nhận. Nhánh tích hợp chưa nhận các thay đổi này.

### Tích hợp trên nhánh Quỳnh Hân

Sau mốc trên, nhánh `feat/itineraries` đã lấy lõi phòng `e70e380` và bổ sung [API sao chép sang lịch trình cá nhân](ROOM_ITINERARY_COPY.md), gồm phần nối nút hiện có. Đây là hợp đồng được triển khai để review; cần Công Định xác nhận trước khi nghiệm thu, chưa phải thay đổi đã merge vào nhánh tích hợp. Các giới hạn auth, danh mục và trạng thái địa điểm nêu trên vẫn còn áp dụng.
