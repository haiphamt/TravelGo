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

1. Cập nhật nhánh gốc trước khi tách nhánh. Chọn nhánh đã có phần mã mà task phụ thuộc. Trong lúc frontend chưa được hợp nhất vào `main`, các task cần mã frontend lấy mốc từ `feat/travelgo-frontend`. Ghi nhánh đích trong PR để người review biết nơi tích hợp.
2. Tạo nhánh riêng theo task, ví dụ `feat/auth-roles`, `feat/place-api`, `fix/trip-validation`. Dùng tài khoản GitHub của mình. Kiểm tra `git status` và `git diff --staged` trước khi commit.
3. Mỗi commit chứa một thay đổi có mục đích rõ, ví dụ `feat(api): add place search filters` hoặc `test(auth): reject updates by unauthorized owners`. Có thể có nhiều commit cho một task.
4. Push nhánh và mở **một PR cho một task hoặc một nhóm thay đổi liên quan trực tiếp**. Dùng Draft PR khi cần góp ý sớm. Dùng [mẫu PR hiện có](.github/pull_request_template.md) và điền mã task của backlog TravelGo.
5. Mời ít nhất một thành viên khác review. Nếu chạm `frontend/`, mời người phụ trách frontend xem phần tích hợp. Chỉ hợp nhất sau khi đã xử lý các góp ý cần sửa, giải quyết xung đột và chạy kiểm tra trên bản cuối. Đưa thay đổi vào `main` qua PR đã được review.

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

## 5. Dữ liệu, ảnh và môi trường

- Thay đổi cấu trúc MySQL qua migration để các máy chạy lại được. Dùng factory hoặc seed có thể tái tạo cho phát triển và kiểm thử. Nếu cần xóa hoặc chuyển đổi dữ liệu khi chạy migration, ghi rõ ảnh hưởng và cách kiểm tra trong PR.
- Bảo toàn nguồn, tác giả và giấy phép khi nhập địa điểm hoặc ảnh. Chỉ đưa ảnh đúng địa điểm có quyền dùng lại vào kho công khai. Dữ liệu demo tự tạo phải được ghi rõ là demo. Chuyển dữ liệu thử từ trình duyệt sang hệ thống thật cần có luồng nhập dữ liệu được nhóm thống nhất.
- Giữ mật khẩu, token, API key và cấu hình cá nhân trong môi trường cục bộ hoặc dịch vụ quản lý cấu hình. `.env.example` chỉ chứa tên biến và giá trị mẫu. Loại thông tin nhạy cảm khỏi log, ảnh chụp và dữ liệu seed. Báo nhóm để thu hồi ngay nếu secret bị lộ trong commit.
- Dùng kiểm tra đầu vào phía Laravel, cơ chế phân quyền và truy vấn tham số hóa của framework. Khi gặp lỗi, trả thông báo đủ để người dùng xử lý và giữ chi tiết kỹ thuật trong log phù hợp.

## 6. Kiểm thử thuộc về người làm task

- Với mỗi luồng thay đổi, kiểm tra ít nhất tình huống thành công và các tình huống sai, thiếu quyền hoặc vượt giới hạn có liên quan. Nếu sửa lỗi có thể tái hiện bằng code, thêm hoặc cập nhật test để lỗi khó quay lại.
- Khi chạm frontend, chạy `npm test` và `npm run build` trong `frontend/`. Khi tích hợp luồng người dùng, thử trực tiếp trên desktop và mobile. Dùng Playwright cho các luồng trình duyệt chính khi bộ test đó được thiết lập.
- Khi chạm backend, chạy `php artisan test` trong `backend/`. Viết Laravel Feature Test cho API mới hoặc thay đổi quan trọng. Dùng cơ sở dữ liệu kiểm thử và dữ liệu mẫu riêng cho các test ghi hoặc xóa dữ liệu.
- Ghi cách kiểm tra và kết quả thực tế trong PR. Nếu chưa chạy được một kiểm tra vì còn phụ thuộc task khác, ghi rõ điều còn thiếu để người review biết phần nào chưa được xác minh.

## 7. Dùng AI và mã tham khảo

- Thành viên chịu trách nhiệm về code mình gửi và phải giải thích được luồng xử lý, cách test và các quyết định chính. Đọc diff do AI tạo trước khi đưa vào PR.
- Ghi nguồn cho mã, thư viện, ảnh và dữ liệu bên ngoài. Khi AI hỗ trợ thay đổi đáng kể, ghi ngắn gọn phần AI làm và cách bạn kiểm tra kết quả. Giữ quyền truy cập tài khoản và dữ liệu của nhóm trong phạm vi cần thiết cho task.

## 8. Khi nào được đánh dấu hoàn thành

Khi mở PR, cập nhật task sang chờ review và gắn link PR vào backlog. Đánh dấu hoàn thành khi đạt đầu ra đã thống nhất, có kết quả kiểm tra và PR đã được hợp nhất hoặc phần bàn giao đã được nhóm chấp nhận. Ghi rõ phụ thuộc còn mở và các bước cần thiết để thành viên tiếp theo có thể chạy hoặc tích hợp phần đó.
