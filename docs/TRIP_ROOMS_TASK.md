# Task 4 — Phòng cùng đi

- **Phụ trách** · Phạm Công Định
- **Nhánh** · `feat/trip-rooms`
- **Đầu ra** · Tạo phòng, gia nhập bằng mã mời, đề xuất địa điểm, mở bình chọn, lưu phiếu, chốt kết quả và tích hợp màn Phòng cùng đi hiện có.

## 1. Mở repo và đọc trước khi sửa

1. Mở thư mục gốc của bản clone [haiphamt/TravelGo](https://github.com/haiphamt/TravelGo) trong Codex. Chọn GPT-6.1 Sol Ultra nếu có. Đọc [rules.md](../rules.md), [mẫu PR](../.github/pull_request_template.md) và [hướng dẫn khung backend](BACKEND_FOUNDATION_TASK.md). Đọc `backend/README.md` khi khung đã vào nhánh tích hợp.
2. Chạy `git status --short` và `git fetch origin`. Có thể chuẩn bị hợp đồng và test trong lúc [PR khung #3](https://github.com/haiphamt/TravelGo/pull/3) được review. Sau khi khung vào nhánh tích hợp, tạo nhánh, ví dụ `git switch -c feat/trip-rooms origin/feat/travelgo-frontend`. Nếu nhóm đã chuyển sang `main` có cả frontend và backend thì dùng `origin/main`. Tiếp tục trên nhánh task nếu đã tạo.
3. Nếu hướng dẫn chưa có trên nhánh hiện tại, đọc bằng `git show origin/docs/update-team-assignments:docs/TRIP_ROOMS_TASK.md`. Trước khi sửa, đọc `frontend/src/app/{group-room,room-state,store,logic}.ts`, template `group-room.html` và `frontend/tests/group-room.test.ts`. Rà màn `/phong-cung-di` và các trạng thái hiện có trên desktop/mobile.

## 2. Hợp đồng dùng chung

- Dùng tài khoản đã xác thực do Tuấn Hải phụ trách và khóa ngoại cùng kiểu với `users.id`. Vai trò **chủ phòng** được xác định theo từng phòng. Quyền Chủ cơ sở hoặc Quản trị viên của toàn hệ thống là phần của task khác.
- Dùng API tra cứu và mã địa điểm công khai của Hữu Hiếu. Giữ cách hiển thị địa điểm không còn hợp lệ. Có thể dùng fixture cho địa điểm và các thành viên trong test khi phần của đồng đội chưa sẵn sàng.
- Chốt với Quỳnh Hân cách sao chép kết quả sang lịch trình cá nhân, gồm thứ tự, giờ ghé, mã địa điểm và tài khoản lưu. Lõi Phòng cùng đi có thể triển khai trước. Dùng API lịch trình chung khi nối bước sao chép.

## 3. Thứ tự triển khai

1. **Tạo phòng và tham gia.** Lưu phòng, chủ phòng, mã mời và thành viên. Mã mời do backend sinh và có ràng buộc duy nhất. Người đã tham gia dùng lại mã sẽ nhận cùng phòng và chỉ có một quan hệ thành viên. Kiểm tra quyền trước khi xem dữ liệu phòng. Phân biệt lỗi mã sai, phòng đầy và tài khoản chưa đăng nhập theo hợp đồng API.
2. **Đề xuất và mở bình chọn.** Xác thực mã địa điểm, quyền thành viên và trạng thái phòng. Bám `room-state.ts`, hiện có tối đa 12 thành viên, 12 địa điểm đề xuất và 5 điểm trong kết quả. Dùng ràng buộc cơ sở dữ liệu và cập nhật nhất quán khi hai yêu cầu đến gần nhau, nhất là tham gia phòng hoặc đề xuất trùng điểm.
3. **Lưu phiếu và chốt.** Lấy người bỏ phiếu từ phiên đăng nhập. Thành viên có thể thay lựa chọn của mình trong giai đoạn mở bình chọn. Chỉ chủ phòng được mở bình chọn và chốt kết quả. Giữ thứ tự kết quả và khóa việc ghi phiếu sau khi chốt. Kiểm tra trạng thái lại trên backend khi ghi phiếu hoặc chốt để hai yêu cầu đồng thời cho kết quả nhất quán.
4. **Nối Angular.** Dùng màn, bố cục và trạng thái hiện có. Nối phần tạo, gia nhập, đề xuất, bình chọn, kết quả và chỉnh lịch theo hành vi sẵn có. Dùng tài khoản và quyền do backend trả về để hiển thị nút. Kiểm tra kết quả từ hai phiên đăng nhập riêng. Phần sao chép sang lịch trình nối sau khi hợp đồng với Quỳnh Hân sẵn sàng.

## 4. Kiểm thử trước khi mở PR

| Phần | Tình huống cần kiểm tra |
| --- | --- |
| Phòng | Tạo và gia nhập bằng mã hợp lệ, mã sai, gia nhập lại không trùng, phòng đầy, người ngoài không xem được nội dung phòng. |
| Đề xuất | Mã địa điểm hợp lệ, mã sai, điểm trùng và vượt giới hạn. Kiểm tra quyền thành viên. |
| Bình chọn và chốt | Thành viên cập nhật phiếu của mình. Người ngoài không bỏ phiếu. Thành viên thường không chốt được. Chốt chỉ thành công với lựa chọn hợp lệ. Chốt lặp hoặc ghi phiếu sau chốt không làm đổi kết quả. |
| Trình duyệt | Dùng hai phiên đăng nhập thử luồng tạo → tham gia → đề xuất → bình chọn → chốt. Kiểm tra desktop/mobile và luồng sao chép lịch trình nếu đã nối. |

Viết Laravel Feature Test cho trạng thái, phân quyền và ràng buộc cơ sở dữ liệu. Dùng unit test với logic độc lập mới hoặc sửa. Chạy `php artisan test` trên MySQL test riêng. Nếu sửa Angular, chạy `npm test`, `npm run build` trong `frontend/` và dùng Playwright với luồng liên quan khi bộ test chung sẵn sàng.

## 5. Prompt gửi Codex

```text
Tôi là Phạm Công Định, làm Task 4 của haiphamt/TravelGo trên feat/trip-rooms. Đọc rules.md, .github/pull_request_template.md, backend/README.md và docs/TRIP_ROOMS_TASK.md. Nếu file hướng dẫn chưa có ở nhánh này, chạy git fetch origin rồi đọc git show origin/docs/update-team-assignments:docs/TRIP_ROOMS_TASK.md. Kiểm tra git status, nhánh tích hợp và mã GroupRoom/room-state hiện có.

Làm tạo phòng, mã mời, thành viên, đề xuất, bình chọn và chốt kết quả theo file hướng dẫn. Dùng người đăng nhập thật để kiểm tra quyền thành viên/chủ phòng. Kiểm tra trạng thái phòng và giữ dữ liệu nhất quán khi gia nhập, bỏ phiếu hoặc chốt lặp. Dùng hợp đồng địa điểm của Hữu Hiếu. Phối hợp với Quỳnh Hân cho bước sao chép lịch trình. Giữ giao diện Angular đã bàn giao.

Viết và chạy test theo checklist, gồm phân quyền và cập nhật lặp. Rà diff, ghi lệnh, số test, kết quả thực tế và phụ thuộc còn chờ. Soạn PR theo mẫu repo để tôi kiểm tra lại trước khi commit, push và mở PR.
```

## 6. Mở PR và bàn giao

- Kiểm tra `git status --short`, `git diff --check`, `git diff --cached --check` và đọc toàn bộ diff. Push `feat/trip-rooms` rồi mở PR về nhánh tích hợp. Khi phần sao chép còn chờ, có thể bàn giao lõi phòng trong PR riêng, ghi rõ hợp đồng cần nối sau. Dùng Draft nếu phạm vi PR còn kiểm thử hoặc phụ thuộc chưa hoàn tất.
- Tiêu đề gợi ý `feat(rooms): add invites, voting and room decisions`. Điền **Task liên quan**, **Thay đổi / đầu ra** (luồng phòng và quyền), **Kiểm tra và minh chứng** (kết quả test và thao tác hai tài khoản), **Review** (người review, phần AI hỗ trợ và cách đã kiểm tra).
- Mời ít nhất một thành viên khác review và mời Tuấn Hải khi chạm Angular. Gắn PR vào backlog, chia sẻ payload kết quả với Quỳnh Hân và cập nhật kết quả test sau review.
