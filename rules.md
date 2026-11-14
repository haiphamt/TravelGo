# Quy tắc làm việc chung của TravelGo

Áp dụng cho mọi thành viên sửa mã nguồn, cấu hình, dữ liệu mẫu hoặc kiểm thử trong repo. Đọc file này trước khi nhận task. Khi dùng AI để triển khai, đưa file này và nội dung task vào ngữ cảnh ngay từ đầu, rồi tự kiểm tra mọi thay đổi trước khi commit.

## 1. Giữ thiết kế frontend đã bàn giao

- Dùng [commit frontend đã bàn giao](https://github.com/haiphamt/TravelGo/commit/29b3f0004f38c0c7d1e00340d8c98c69011ce3ee) làm mốc đối chiếu giao diện. Giữ bố cục, màu, chữ, khoảng cách, hình ảnh, nút, tên mục, điều hướng, thao tác và cách hiển thị trên desktop/mobile. Áp dụng cho cả màn Người dùng, Chủ cơ sở và Quản trị viên.
- Task backend hoặc database làm trong `backend/`. Khi task cần tích hợp Angular, chỉ sửa phần gọi API, kiểu dữ liệu, chuyển đổi dữ liệu, liên kết dữ liệu vào component, xử lý trạng thái và test liên quan. Nếu cần sửa template để hiển thị dữ liệu thật, dùng cấu trúc giao diện đang có và ghi rõ phần đã chạm vào trong PR.
- Không tự thiết kế lại màn hình, thay CSS dùng chung, sửa ảnh hoặc bỏ chức năng hiện có. Nếu yêu cầu nghiệp vụ thực sự cần đổi giao diện, nêu màn hình, lý do và ảnh hưởng để người phụ trách frontend đồng ý trước. Đưa thay đổi giao diện vào task và PR riêng để dễ đối chiếu.

## 2. Nhận task và làm đúng phạm vi

- Chốt người phụ trách, đầu ra và điều kiện hoàn thành của task trong backlog nhóm trước khi code. Mỗi task có một người chịu trách nhiệm chính. Người khác có thể hỗ trợ và review.
- Angular nằm trong `frontend/`. Laravel nằm trong `backend/` khi được khởi tạo. Migration, factory và seeder dùng cấu trúc `backend/database/` của Laravel. Dùng chung một khung backend do nhóm review.
- Kiểm tra ai đang sửa cùng file hoặc module. Thống nhất với họ nếu cần thay đổi dùng chung. Tránh gom đổi định dạng hàng loạt, đổi tên, nâng phiên bản thư viện hoặc dọn code ngoài phạm vi task vào PR đang làm.

## 3. Nhánh, commit và pull request

1. Cả nhóm thống nhất một nhánh tích hợp trước khi tách nhánh. Mốc hiện có cả frontend và quy tắc nhóm là `feat/travelgo-frontend`. Nếu bắt đầu trước khi mốc này vào `main`, tạo nhánh từ `feat/travelgo-frontend` và mở PR về nhánh đó. Sau khi nhóm hợp nhất mốc bàn giao, lấy `main` đã cập nhật làm gốc cho task mới.
2. Tạo nhánh riêng theo task. Dùng `feat/` cho chức năng mới, `fix/` cho sửa lỗi và `test/` cho task chỉ bổ sung kiểm thử. Dùng tài khoản GitHub của mình. Kiểm tra `git status` và `git diff --staged` trước khi commit.
3. Mỗi commit chứa một thay đổi có mục đích rõ, ví dụ `feat(api): add place search filters` hoặc `test(auth): reject updates by unauthorized owners`. Có thể có nhiều commit cho một task.
4. Push nhánh và mở **một PR cho một task hoặc một nhóm thay đổi liên quan trực tiếp**. Dùng Draft PR khi cần góp ý sớm. Dùng [mẫu PR hiện có](.github/pull_request_template.md) và điền mã task của backlog TravelGo.
5. Mời ít nhất một thành viên khác review. Nếu chạm `frontend/`, mời người phụ trách frontend xem phần tích hợp. Chỉ hợp nhất sau khi đã xử lý các góp ý cần sửa, giải quyết xung đột và chạy kiểm tra trên bản cuối. Đưa thay đổi vào `main` qua PR đã được review.

### Phân công triển khai và nhánh bắt đầu

| Phụ trách | Nhánh bắt đầu | Phần việc |
| --- | --- | --- |
| Phạm Tuấn Hải | `feat/auth-roles` | Hộp thoại Angular, đăng ký và đăng nhập bằng email, đăng nhập Google, đăng xuất, phiên đăng nhập và vai trò tài khoản. |
| Chung Minh Hiếu | `feat/backend-foundation` | Khung Laravel/MySQL, migration, dữ liệu thử và quy trình nhập dữ liệu địa điểm. [Hướng dẫn triển khai](docs/BACKEND_FOUNDATION_TASK.md) |
| Bạn 2 | `feat/places-reviews` | API địa điểm, Khám phá, Góc Địa Phương, yêu thích và đánh giá. |
| Bạn 3 | `feat/itineraries` | Tạo lịch trình thủ công và bằng AI, lưu và chỉnh sửa lịch trình. |
| Bạn 4 | `feat/trip-rooms` | Tạo phòng, tham gia bằng mã mời, đề xuất điểm ghé và bình chọn. |
| Bạn 5 | `feat/owner-moderation` | API cho Chủ cơ sở và Quản trị viên, quyền quản lý địa điểm, xử lý đóng góp và xét duyệt. |

Nhóm gán tên cho Bạn 2–5 trong backlog. Tài khoản tự đăng ký bằng email hoặc đăng nhập lần đầu bằng Google có vai trò **Người dùng**. Người phụ trách xét duyệt triển khai luồng cấp quyền quản lý cho **Chủ cơ sở**. Mỗi người phụ trách API kiểm tra quyền trên tài nguyên thuộc phần mình và đưa kiểm thử vào cùng PR.

Người phụ trách khung backend mở PR đầu tiên để nhóm dùng chung cấu hình Laravel, MySQL và dữ liệu thử. Những người làm API có thể thống nhất hợp đồng API trong lúc chờ review. Tách nhánh triển khai từ nhánh tích hợp sau khi PR khung backend đã được hợp nhất. Tách nhánh mới khi nhận task độc lập tiếp theo.

Ví dụ tạo nhánh API địa điểm khi nhóm đang tích hợp trên `feat/travelgo-frontend`:

```sh
git fetch origin
git switch -c feat/places-reviews origin/feat/travelgo-frontend
```

Sau khi đã commit, chạy `git push -u origin feat/places-reviews`. Trên GitHub chọn **base** là `feat/travelgo-frontend` và **compare** là `feat/places-reviews`. Khi nhóm đã chuyển mốc tích hợp về `main`, dùng `main` cho cả nhánh gốc và PR đích của task mới.

PR cần cho người review biết:

- Task liên quan và luồng người dùng hoặc API bị ảnh hưởng.
- Thay đổi chính và cách tái hiện. Nếu có sửa lỗi, ghi kết quả mong đợi sau khi sửa.
- Cách chạy và kết quả kiểm thử. Gắn ảnh, log hoặc minh chứng phù hợp với task.
- Các bước cài đặt thêm nếu có migration, seed, biến môi trường hoặc thay đổi hợp đồng API.
- Phần còn lại, giới hạn đã biết, nguồn tham khảo và việc dùng AI nếu có.

## 4. Thống nhất API trước khi nối frontend

- Với API mới hoặc thay đổi, chốt với người tích hợp phương thức, đường dẫn, tham số, ví dụ request/response, điều kiện truy cập và cách báo lỗi. Ghi hợp đồng ngắn gọn trong task hoặc PR để hai bên có thể triển khai song song.
- Giữ mã địa điểm ổn định giữa danh mục, bản đồ, yêu thích, đánh giá và lịch trình. Nếu backend dùng khóa nội bộ, thống nhất cách ánh xạ với mã nguồn OSM và Góc Địa Phương.
- Backend kiểm tra dữ liệu và quyền cho từng thao tác, kể cả khi giao diện đã ẩn nút. Kiểm tra quyền theo đúng tài khoản, địa điểm hoặc phòng. Ví dụ, Chủ cơ sở chỉ sửa địa điểm được cấp quyền và chỉ chủ phòng mới chốt bình chọn.
- Thống nhất dữ liệu thiếu, danh sách rỗng, phân trang và lỗi quyền truy cập. Giữ `null` cho giá hoặc tọa độ chưa biết, tránh trả giá, điểm đánh giá hoặc trạng thái mở cửa tự điền. Xử lý trường hợp API lỗi hoặc tải chậm trong các trạng thái giao diện đang có.

## 5. Quy tắc cho người phụ trách dữ liệu

- Quản lý schema MySQL bằng migration, dữ liệu thử bằng factory hoặc seeder trong `backend/database/`. Khi cần đổi schema đã được hợp nhất, thêm migration mới. Với migration xóa hoặc chuyển đổi dữ liệu, ghi rõ ảnh hưởng và cách kiểm tra trong PR.
- Khi nhập địa điểm, giữ mã nguồn và ánh xạ với ID trong MySQL. Dùng cặp nguồn và mã nguồn để nhận diện bản ghi đã nhập. Chạy lại importer hoặc seeder cần cho kết quả ổn định và tránh tạo trùng. Kiểm tra địa chỉ, phạm vi tọa độ, danh mục và các trường bắt buộc trước khi đưa vào danh mục.
- Ghi nguồn, thời điểm lấy dữ liệu và quyền sử dụng trong metadata hiện có hoặc trong PR. Với ảnh, lưu tác giả, liên kết gốc và giấy phép. Đối chiếu đúng địa điểm hoặc chi nhánh trước khi ghép ảnh. Ảnh Local đang chờ xác nhận quyền dùng lại được giữ ngoài kho công khai.
- Giữ `null` cho giá, giờ, tọa độ hoặc thông tin chưa biết. Dữ liệu demo tự tạo cần có nhãn demo. Dùng dữ liệu thử riêng cho kiểm thử và chạy thử migration hoặc import trên cơ sở dữ liệu phát triển. Chuyển dữ liệu thử từ trình duyệt sang hệ thống thật cần có luồng nhập được nhóm thống nhất.
- PR dữ liệu cần ghi nguồn, lệnh chạy lại, số bản ghi đã thêm hoặc cập nhật, số mục bị loại và lý do nếu có. Kèm test cho các trường hợp trùng mã, thiếu trường, tọa độ sai, chạy nhập lại hoặc vi phạm ràng buộc có liên quan đến thay đổi.

## 6. Môi trường và bảo mật

- Giữ mật khẩu, token, API key và cấu hình cá nhân trong môi trường cục bộ hoặc dịch vụ quản lý cấu hình. `.env.example` chỉ chứa tên biến và giá trị mẫu. Loại thông tin nhạy cảm khỏi log, ảnh chụp và dữ liệu seed. Báo nhóm để thu hồi ngay nếu secret bị lộ trong commit.
- Dùng kiểm tra đầu vào phía Laravel, cơ chế phân quyền và truy vấn tham số hóa của framework. Khi gặp lỗi, trả thông báo đủ để người dùng xử lý và giữ chi tiết kỹ thuật trong log phù hợp.

## 7. Người viết code phải viết kiểm thử

- Mỗi PR thêm hoặc sửa hành vi của ứng dụng phải có **test tự động mới hoặc test được cập nhật** ngay trong cùng PR. Người làm task chịu trách nhiệm viết và chạy test cho phần mình. Với lỗi đã sửa, test cần tái hiện được tình huống từng gây lỗi.
- **Logic độc lập** như kiểm tra ngày, giới hạn điểm ghé, chuẩn hóa dữ liệu hoặc tính chi phí cần unit test. Dùng `node:test` trong `frontend/tests/` cho logic TypeScript và PHPUnit trong `backend/tests/Unit/` cho logic PHP.
- **API, phân quyền và cơ sở dữ liệu** cần Laravel Feature Test trong `backend/tests/Feature/`. Kiểm tra kết quả thành công và các trường hợp đầu vào sai, thiếu quyền, trùng hoặc vượt giới hạn phù hợp với task. Test ghi hoặc xóa dữ liệu chạy trên cơ sở dữ liệu kiểm thử.
- **Luồng trình duyệt** kiểm tra bằng Playwright khi bộ test chung đã được thiết lập. Khi thay đổi tích hợp, thử luồng liên quan trên desktop và mobile. Trong `frontend/`, chạy `npm test` và `npm run build`. Trong `backend/`, chạy `php artisan test`.
- Ghi lệnh đã chạy, kết quả và trường hợp test chính trong PR. Nếu test còn chờ phụ thuộc, giữ PR ở trạng thái Draft và ghi rõ phần đang chờ. PR chỉ sửa tài liệu hoặc định dạng có thể ghi cách rà soát phù hợp với thay đổi đó.

## 8. Dùng AI và mã tham khảo

- Thành viên chịu trách nhiệm về code mình gửi và phải giải thích được luồng xử lý, cách test và các quyết định chính. Đọc diff do AI tạo trước khi đưa vào PR.
- Ghi nguồn cho mã, thư viện, ảnh và dữ liệu bên ngoài. Khi AI hỗ trợ thay đổi đáng kể, ghi ngắn gọn phần AI làm và cách bạn kiểm tra kết quả. Giữ quyền truy cập tài khoản và dữ liệu của nhóm trong phạm vi cần thiết cho task.

## 9. Khi nào được đánh dấu hoàn thành

Khi mở PR, cập nhật task sang chờ review và gắn link PR vào backlog. Đánh dấu hoàn thành khi đạt đầu ra đã thống nhất, có kết quả kiểm tra và PR đã được hợp nhất hoặc phần bàn giao đã được nhóm chấp nhận. Ghi rõ phụ thuộc còn mở và các bước cần thiết để thành viên tiếp theo có thể chạy hoặc tích hợp phần đó.
