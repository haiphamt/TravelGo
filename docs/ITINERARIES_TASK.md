# Task 3 — Lịch trình thủ công và bằng AI

- **Phụ trách** · Nguyễn Thị Quỳnh Hân
- **Nhánh** · `feat/itineraries`
- **Đầu ra** · Tạo, xem, lưu và chỉnh sửa lịch trình theo tài khoản. Luồng AI tạo bản xem trước từ danh mục TravelGo để người dùng kiểm tra trước khi lưu.

## 1. Mở repo và đọc trước khi sửa

1. Mở thư mục gốc của bản clone [haiphamt/TravelGo](https://github.com/haiphamt/TravelGo) trong Codex. Chọn GPT-6.1 Sol Ultra nếu có. Đọc [rules.md](../rules.md), [mẫu PR](../.github/pull_request_template.md) và [hướng dẫn khung backend](BACKEND_FOUNDATION_TASK.md). Đọc `backend/README.md` khi khung đã vào nhánh tích hợp.
2. Chạy `git status --short` và `git fetch origin`. Có thể chuẩn bị hợp đồng và test trong lúc [PR khung #3](https://github.com/haiphamt/TravelGo/pull/3) được review. Sau khi khung vào nhánh tích hợp, tạo nhánh, ví dụ `git switch -c feat/itineraries origin/feat/travelgo-frontend`. Nếu nhóm đã chuyển sang `main` có cả frontend và backend thì dùng `origin/main`. Tiếp tục trên nhánh task nếu đã tạo.
3. Nếu hướng dẫn chưa có trên nhánh hiện tại, đọc bằng `git show origin/docs/update-team-assignments:docs/ITINERARIES_TASK.md`. Trước khi sửa, mở `frontend/src/app/didaune/planner-list/`, `didaune/planner-create-ai/` dưới cùng thư mục, `trip-builder.ts`, `trip.ts`, `trip-storage.ts`, `trip-suggestion.ts` và phần lịch trình trong `logic.ts`. Đọc test `trip-planning`, `trip-suggestion` và `workflow` trong `frontend/tests/`.
4. Chạy thử hoặc rà các màn `/lich-trinh`, `/lich-trinh/tao-thu-cong`, `/lich-trinh/tao-ai` và `/lich-trinh/chinh-sua`. Giữ hai lối tạo lịch trình, bố cục biểu mẫu, bản xem trước và thao tác chỉnh sửa hiện có.

## 2. Hợp đồng dùng chung

- Lấy người sở hữu từ tài khoản đã xác thực của Tuấn Hải. Khóa ngoại tài khoản dùng kiểu của `users.id`. Dùng fixture trong test để phát triển trước khi nối phiên đăng nhập thật.
- Dùng [mã địa điểm chung](../rules.md#mã-địa-điểm-dùng-chung) và API tra cứu của Hữu Hiếu. Với cảnh báo địa điểm đổi giờ, giá hoặc vị trí, thống nhất phiên bản dữ liệu được duyệt với Hữu Hiếu và Quang Huy. Giữ điểm ghé đã lưu và hành vi xem xét thay đổi như bản frontend hiện có.
- Nếu Phòng cùng đi xuất kết quả thành lịch trình, chốt với Công Định payload điểm ghé và quyền sao chép. Công Định quản lý kết quả phòng. Quỳnh Hân quản lý phần lưu lịch trình. Lịch trình thủ công và AI có thể làm trước khi phần sao chép được nối.

## 3. Thứ tự triển khai

1. **Lịch trình thủ công.** Làm API danh sách, xem chi tiết, tạo và cập nhật lịch trình của tài khoản hiện tại. Đọc hành vi danh sách để xử lý cả thao tác xóa nếu màn đang có. Mỗi lịch trình lưu thông tin chuyến đi và các điểm ghé theo thứ tự. Kiểm tra ngày đi, ngày ghé, giờ, điểm ghé trùng, ngân sách và ghi chú. Bám giới hạn của `validateTripDraft` hiện có, gồm 1–5 điểm ghé. Khi lưu lịch trình và các điểm trong một thao tác, bảo đảm dữ liệu nhất quán nếu ghi thất bại.
2. **Gợi ý lịch trình.** Giữ bước nhập nhu cầu → tạo bản xem trước → chỉnh sửa/lưu. Dùng dữ liệu danh mục để lọc địa điểm hợp lệ, bao gồm tùy chọn Góc Địa Phương. Kết quả phải tham chiếu ID có thật và qua cùng kiểm tra điểm ghé trước khi lưu. Kiểm tra luồng nguồn gợi ý hiện có trong `planner-preview.ts`. Khi nhóm chốt nhà cung cấp AI, gọi từ Laravel, giữ khóa API ở backend và giới hạn đầu vào/kết quả. Trước đó có thể phát triển bằng mô phỏng có nhãn và test thay thế phản hồi nhà cung cấp. Ghi rõ trong PR phần nào đang dùng mô phỏng.
3. **Nối Angular.** Tái sử dụng màn và bố cục hiện có. Giữ bản nháp khi người dùng gặp lỗi gửi hoặc lỗi tạo gợi ý. Kiểm tra lịch trình xuất hiện trong danh sách và có thể mở lại đúng nội dung sau reload. Khi gợi ý lỗi hoặc hết thời gian chờ, người dùng vẫn có thể tạo thủ công. Dữ liệu đã lưu trong bản demo cũ cần có quy tắc do nhóm chốt nếu muốn chuyển sang tài khoản thật.

## 4. Kiểm thử trước khi mở PR

| Phần | Tình huống cần kiểm tra |
| --- | --- |
| Lịch trình | Tạo, lưu, mở lại, đổi thứ tự điểm ghé và giữ nội dung sau reload. Từ chối ngày hoặc giờ sai, điểm trùng, chi phí âm, vượt giới hạn điểm và mã địa điểm không tồn tại. |
| Quyền | Hai tài khoản có danh sách riêng. Tài khoản khác không thể đọc, sửa hoặc xóa lịch trình của người sở hữu bằng cách đổi ID. |
| Gợi ý | Phản hồi hợp lệ, danh mục rỗng, mã địa điểm không hợp lệ, nhà cung cấp lỗi hoặc quá thời gian. Xác nhận bản xem trước chưa tạo lịch trình đã lưu. |
| Tích hợp | Thử tạo thủ công và tạo bằng AI trên desktop/mobile. Nếu phần sao chép từ phòng đã nối, kiểm tra kết quả được chuyển đúng thứ tự và vẫn kiểm tra quyền. |

Viết Laravel Feature Test trên MySQL test riêng và unit test cho logic ngày, thứ tự, chi phí hoặc lọc gợi ý khi thay đổi. Chạy `php artisan test`, `npm test` và `npm run build` nếu chạm Angular. Dùng Playwright cho luồng liên quan khi bộ test chung sẵn sàng. Các test gợi ý chạy được bằng dữ liệu mẫu và phản hồi giả lập.

## 5. Prompt gửi Codex

```text
Tôi là Nguyễn Thị Quỳnh Hân, làm Task 3 trong haiphamt/TravelGo trên feat/itineraries. Đọc rules.md, .github/pull_request_template.md, backend/README.md và docs/ITINERARIES_TASK.md. Nếu file task chưa có ở nhánh làm việc, chạy git fetch origin rồi đọc git show origin/docs/update-team-assignments:docs/ITINERARIES_TASK.md. Kiểm tra git status, nhánh tích hợp đã có backend và các file lịch trình trong frontend.

Triển khai lịch trình thủ công trước, rồi luồng gợi ý và bản xem trước. Giữ giao diện đã bàn giao. Dùng phiên tài khoản và mã địa điểm đã chốt. Kiểm tra quyền sở hữu, lưu thứ tự điểm ghé và xử lý trường hợp ghi thất bại. Nếu nhà cung cấp AI chưa được chốt, chuẩn bị phần tích hợp và test bằng phản hồi giả lập, rồi ghi rõ trạng thái triển khai trong PR. Phối hợp với Công Định nếu nối luồng sao chép từ phòng.

Thêm và chạy test theo checklist, rà diff, ghi lệnh và kết quả thật, soạn nội dung PR theo mẫu repo để tôi kiểm tra trước khi commit, push và mở PR.
```

## 6. Mở PR và bàn giao

- Rà `git status --short`, `git diff --check`, `git diff --cached --check` và toàn bộ diff. Kiểm tra khóa AI, file môi trường, dữ liệu mẫu và thay đổi ngoài phạm vi. Push `feat/itineraries` rồi mở PR về nhánh tích hợp. Nếu phần AI còn cần nhà cung cấp, có thể mở PR lịch trình thủ công trước và làm phần AI ở PR sau. Dùng Draft nếu phạm vi PR còn kiểm thử hoặc phụ thuộc chưa hoàn tất.
- Tiêu đề gợi ý `feat(itineraries): add saved trips and itinerary planning`. Điền **Task liên quan**, **Thay đổi / đầu ra** (API và luồng xem trước/lưu), **Kiểm tra và minh chứng** (lệnh, kết quả thật, dữ liệu mẫu và trạng thái AI), **Review** (người review, phần AI hỗ trợ và cách đã kiểm tra).
- Mời ít nhất một bạn khác review và mời Tuấn Hải xem phần Angular. Gắn PR vào backlog, chia sẻ hợp đồng sao chép với Công Định khi có và cập nhật kết quả test sau review.
