# API lịch trình của Quỳnh Hân

Task 3 — nhánh `feat/itineraries`. Đọc cùng `rules.md` và hướng dẫn Task 3 tại commit `5431943` trên `docs/update-team-assignments`.

## Phạm vi và phụ thuộc

Đã triển khai CRUD lịch trình theo tài khoản, kiểm tra đầu vào, thứ tự điểm ghé, snapshot địa điểm, lưu giao dịch và bản xem trước gợi ý mô phỏng. Chưa tích hợp nhà cung cấp AI thật. Người dùng phải xác nhận lưu bằng API tạo lịch trình riêng.

Nhánh làm việc lấy gốc `feat/travelgo-frontend` tại `f4406f5`, sau đó lấy nguyên commit schema địa điểm `362b450` của Hữu Hiếu làm phụ thuộc. Không viết lại migration `places`. PR lịch trình cần chờ PR schema được review/merge; hợp đồng schema hiện vẫn là bản đề xuất của người phụ trách.

Phiên đăng nhập của Tuấn Hải và importer/API địa điểm chưa có ở nhánh tích hợp. Feature test dùng tài khoản và địa điểm tự tạo trong MySQL test. Không thêm endpoint đăng nhập thử hoặc tự gán tài khoản cho request thật.

## Xác thực và CSRF

Các endpoint nghiệp vụ dùng middleware Laravel `web` và `auth`. Người sở hữu luôn lấy từ `$request->user()`, không đọc `userId` trong payload. Cần thống nhất với Tuấn Hải việc dùng session cookie; nếu nhóm chọn Sanctum/token, cập nhật middleware và adapter trong PR tích hợp đã thống nhất.

`GET /api/itineraries/session` khởi tạo session và trả `{authenticated, userId, csrfToken}`. Cookie phải đi cùng các request tiếp theo. Ghi dữ liệu gửi `X-CSRF-TOKEN` và `Accept: application/json`. `userId` trả về chỉ giúp frontend nhận biết đổi tài khoản, không phải thông tin phân quyền do client gửi lại.

## Endpoint

| Phương thức | Đường dẫn | Kết quả |
| --- | --- | --- |
| GET | `/api/itineraries` | `{data: SavedTrip[]}` của tài khoản hiện tại. |
| GET | `/api/itineraries/{uuid}` | `{data: SavedTrip}` hoặc 404 nếu không thuộc tài khoản. |
| POST | `/api/itineraries` | Tạo và trả 201 `{data: SavedTrip}`. |
| PUT | `/api/itineraries/{uuid}` | Thay toàn bộ thông tin và điểm ghé; bắt buộc `version` đã đọc. |
| DELETE | `/api/itineraries/{uuid}` | Xóa lịch trình của mình và điểm ghé, trả 204. Màn danh sách hiện chưa có nút xóa nên không tự thêm nút. |
| POST | `/api/itineraries/suggestions` | Tạo bản xem trước; không ghi bảng lịch trình. Giới hạn 20 request/phút cho mỗi người đăng nhập. |

Payload tạo/cập nhật dùng tên trường hiện có ở Angular:

```json
{
  "name": "Một ngày ở TP.HCM",
  "date": "2026-12-01",
  "endDate": "2026-12-01",
  "note": "Ghi chú chuyến đi",
  "budget": null,
  "source": "manual",
  "points": [
    {"placeId": "osm:node/5922616527", "time": "09:00", "date": "2026-12-01", "estimatedCost": null, "note": ""}
  ]
}
```

ID trong ví dụ phải tồn tại trong MySQL trước khi gửi. `PUT` thêm `version` từ lần đọc gần nhất; stale version trả 409. API trả UUID lịch trình, `version` và `snapshot` của từng điểm. Client gửi snapshot hoặc user ID sẽ không ghi đè dữ liệu server.

Giới hạn giống `validateTripDraft`: tên 80 ký tự; ghi chú chuyến đi 500; ghi chú điểm 180; 1–5 điểm, không trùng; giờ `HH:mm`; ngày thực tế hợp lệ, ngày ghé trong khoảng chuyến đi. Lịch trình thủ công được để trống ngày như frontend hiện tại. Ngân sách/chi phí là số nguyên VND không âm, tối đa `9007199254740991`; `null` khác 0. Ảnh bìa data URL JPG/PNG/WebP phải giải mã thành ảnh đúng loại, tối đa 1 MB.

Điểm ghé tham chiếu `places.id` bằng khóa ngoại; payload giữ mã công khai, gồm cả `osm:node/...`, `osm:way/...`, `osm:relation/...`, `tg-local-<uuid>`, `tg-place-<uuid>` và ID demo. Giữ nguyên thứ tự mảng `points`. Lưu header và toàn bộ điểm trong một transaction. Xóa địa điểm đang được tham chiếu bị chặn để bảo toàn lịch trình.

## Bản xem trước gợi ý

```json
{
  "needs": "cà phê và công viên",
  "area": "",
  "count": 3,
  "includeLocal": true,
  "requested": [],
  "startDate": "2026-12-01",
  "endDate": "2026-12-02"
}
```

Nhu cầu tối đa 500 ký tự, khu vực 120, tối đa 5 tên điểm yêu cầu. Lọc danh mục TP.HCM có tọa độ; loại Local khi không chọn, tối đa một Local trong kết quả. Nhà cung cấp hiện là `MockItinerarySuggestionProvider`, được tiêm qua `ItinerarySuggestionProvider`. Đọc bằng cursor và chỉ chuyển tối đa 500 hồ sơ đã lọc cho provider. Bản mock bám cách tìm từ khóa tên/món chính, ưu tiên tên điểm yêu cầu và cân bằng danh mục của `trip-suggestion.ts`/`planner-preview.ts`. Kết quả phải có ID thuộc chính tập được cấp, không trùng và không vượt số điểm yêu cầu. Giờ ghé và chi phí không được provider tự ghi vào danh mục.

Trả `{data: {points, unmatched, source: "ai-demo", notice}}`; `notice` ghi rõ mô phỏng. Giờ ghé là mốc dự kiến để chỉnh. Mảng điểm được kiểm tra lại khi người dùng xác nhận `POST /api/itineraries`. Provider lỗi/quá thời gian được thay bằng test double ném lỗi; API trả 503. Phản hồi sai ID/trùng/quá giới hạn trả 502; danh mục/kết quả rỗng trả 422. Tích hợp thật cần nhóm chọn provider, rồi gọi từ Laravel với thời gian chờ và giới hạn đầu vào/kết quả; khóa nằm ở môi trường backend.

## Angular và cách chạy

Giữ nguyên bố cục, CSS, ảnh và hai lối tạo. Chỉ đổi liên kết dữ liệu; template danh sách thêm thông báo lỗi ở vùng trạng thái có sẵn, template AI thêm nhãn mô phỏng. Các câu mô tả lưu trên trình duyệt ở sidebar và trình chỉnh sửa đổi theo chế độ lưu để không nói sai khi đang dùng tài khoản. Backend adapter xử lý session, CSRF, lỗi quyền, version và timeout 20 giây. Khi lưu lỗi, form/sessionStorage giữ bản nháp; không tự lưu thành công vào demo để che lỗi API. Thông báo 422 ưu tiên lỗi của trường cần sửa.

`frontend/public/itinerary-config.json` mặc định `{"storage":"demo"}` để giao diện đã bàn giao tiếp tục chạy khi auth và danh mục server chưa sẵn sàng. Đổi thành `{"storage":"api"}` rồi reload để bật API. Chế độ API bỏ qua lịch trình demo cũ, không tự nhập demo sang tài khoản và không ghi lịch trình tài khoản vào IndexedDB dùng chung. Đổi tài khoản trong lúc form mở sẽ chặn lần lưu cho đến khi reload.

Chạy `php artisan serve --host=127.0.0.1 --port=8000` trong `backend/`, sau đó `npm start` trong `frontend/`. Proxy `/api` chuyển về backend; dùng cùng hostname `127.0.0.1`. Cấu hình production cần reverse proxy cùng origin hoặc hợp đồng CORS/cookie do nhóm thống nhất. `.env`/`.env.testing` chỉ dùng cục bộ như `backend/README.md`.

## Điểm cần đồng đội chốt

1. **Tuấn Hải:** session cookie/CSRF như trên hay guard khác, và tín hiệu đổi tài khoản. Hiện chưa kiểm tra được đăng nhập email/Google thật xuyên suốt trình duyệt.
2. **Hữu Hiếu + Minh Hiếu:** merge schema, nhập danh mục và tra cứu địa điểm thật. Frontend vẫn đọc danh mục bàn giao; API lưu chỉ nhận điểm thực sự tồn tại trong MySQL.
3. **Hữu Hiếu + Quang Huy:** hợp đồng phiên bản thay đổi được duyệt. Chỉnh sửa thông thường giữ snapshot đã lưu; các thao tác xác nhận cập nhật/giữ/thay điểm của workflow demo chưa nối API. Ở chế độ API, thao tác đó báo đang chờ hợp đồng và giữ kế hoạch, không báo lưu giả.
4. **Công Định:** đề xuất sao chép kết quả dưới dạng TripDraft với thứ tự, giờ ghé và mã công khai. Định kiểm tra quyền lấy kết quả phòng; Hân kiểm tra chủ lịch trình và lưu qua API chung. Chưa chốt quyền ai được sao chép, thời điểm kết quả được phép dùng và metadata nguồn phòng, vì vậy chưa mở luồng `source: room`. Không coi đề xuất này là hợp đồng đã được đồng đội duyệt.

## Kiểm thử

`php artisan test` chạy trên MySQL `travelgo_test`, có kiểm tra schema/driver trước reset. Bao gồm CRUD, hai tài khoản, version cũ, dữ liệu sai, snapshot không bị giả mạo, rollback khi lần ghi điểm thứ hai thất bại và các phản hồi provider giả lập. `npm test` kiểm tra adapter, định dạng ID, CSRF, đổi tài khoản và bảo toàn bản nháp. Chạy `npm run build` khi sửa Angular.

### Kiểm thử trình duyệt với Laravel/MySQL thật

Trong `frontend/`, chạy `npm run test:itineraries`. Bộ Playwright chạy cả desktop 1440×1000 và mobile 390×844. Cài browser bằng `npx playwright install chromium` hoặc đặt `TRAVELGO_BROWSER_CHANNEL=msedge` để dùng Edge đã cài. Khi PHP chưa ở PATH, đặt `TRAVELGO_PHP` thành đường dẫn `php.exe` có các extension trong README.

Runner khởi động hai máy chủ riêng trên 8002 và 4300. Trước khi reset dữ liệu, `backend/tests/Browser/bootstrap.php` kiểm tra `APP_ENV=testing`, `TRAVELGO_E2E=1`, driver MySQL và tên schema thực tế phải là `travelgo_test`. Chuẩn bị `.env.testing` và tài khoản database test riêng trước khi chạy; không chạy đồng thời với PHPUnit vì cùng dùng schema này.

`prepare.php` migrate fresh schema test, tạo hai tài khoản fixture và bốn địa điểm demo. Frontend dùng cùng danh mục fixture; các request lịch trình thực sự qua proxy, cookie, CSRF, controller, transaction và MySQL. Chỉ request gây mất kết nối được chủ động ngắt trong một ca test. Bộ test kiểm tra tạo/sửa/reload, thứ tự, null/0, dữ liệu giữa hai tài khoản, thiếu CSRF bị từ chối, giữ bản nháp qua reload khi lỗi, preview chưa lưu và xác nhận lưu.

Router test nằm trong `backend/tests/Browser/server.php`, chỉ được nạp qua runner opt-in, không đăng ký trong routing ứng dụng. Endpoint fixture đăng nhập chỉ tạo phiên cho hai tài khoản test; Feature Test xác nhận endpoint này không có trong ứng dụng bình thường. Cách này không triển khai hoặc giả định xong luồng email/Google của Tuấn Hải. Kết nối nhà cung cấp AI thật vẫn chưa được kiểm tra.

Ảnh, trace và báo cáo HTML của Playwright nằm trong `frontend/test-results/` và `frontend/playwright-report/`, đã được Git bỏ qua. Dùng `npx playwright show-report` để xem kết quả.
