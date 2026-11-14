# Task 5 — Chủ cơ sở, đóng góp và xét duyệt

- **Phụ trách** · Triệu Quang Huy
- **Nhánh** · `feat/owner-moderation`
- **Đầu ra** · API cho đóng góp, quyền quản lý cơ sở và xét duyệt. Nối API với hai màn riêng của Chủ cơ sở và Quản trị viên, cùng màn Đóng góp của tôi.

## 1. Mở repo và đọc trước khi sửa

1. Mở thư mục gốc của bản clone [haiphamt/TravelGo](https://github.com/haiphamt/TravelGo) trong Codex. Chọn GPT-6.1 Sol Ultra nếu có. Đọc [rules.md](../rules.md), [mẫu PR](../.github/pull_request_template.md), [hướng dẫn khung backend](BACKEND_FOUNDATION_TASK.md) và `backend/README.md` khi khung đã vào nhánh tích hợp.
2. Chạy `git status --short` và `git fetch origin`. Có thể chuẩn bị luồng trạng thái, quyền và fixture trong lúc [PR khung #3](https://github.com/haiphamt/TravelGo/pull/3) được review. Khi khung vào nhánh tích hợp, tạo nhánh, ví dụ `git switch -c feat/owner-moderation origin/feat/travelgo-frontend`. Nếu nhóm đã chuyển sang `main` có cả frontend và backend thì dùng `origin/main`. Tiếp tục trên nhánh task nếu đã tạo.
3. Nếu hướng dẫn chưa có trên nhánh hiện tại, đọc bằng `git show origin/docs/update-team-assignments:docs/OWNER_MODERATION_TASK.md`. Rà `frontend/src/app/{workflow,workflow-store,proposal-form,contributions,owner-workspace,admin-workspace}.ts` và `frontend/tests/workflow.test.ts`. Đối chiếu các màn `/dong-gop`, `/chu-co-so` và `/quan-tri` để giữ bố cục, điều hướng và trạng thái hiện có.

## 2. Hợp đồng dùng chung

- **Tuấn Hải** quản lý xác thực và vai trò tài khoản. Thống nhất với Hải điều kiện cấp/thu hồi quyền quản lý và quan hệ giữa vai trò Chủ cơ sở với quyền trên từng địa điểm. Khóa ngoại tham chiếu tài khoản cùng kiểu với `users.id`. Trong test, tạo fixture riêng cho Người dùng, Chủ cơ sở và Quản trị viên. Backend suy ra danh tính từ phiên xác thực và kiểm tra quyền trên từng tài nguyên.
- **Lê Nguyễn Hữu Hiếu** quản lý API địa điểm và đánh giá. Dùng cùng ID địa điểm, đánh giá và ảnh. Thống nhất cách bản chỉnh sửa đã duyệt cập nhật địa điểm, cách đánh dấu nội dung bị ẩn và cách trả phản hồi chủ cơ sở. Giữ phiên bản địa điểm/đánh giá làm căn cứ xử lý đề xuất hoặc báo cáo cũ. Khi cần báo lịch trình về thay đổi đã duyệt, thống nhất payload phiên bản hoặc trạng thái với Quỳnh Hân.

## 3. Thứ tự triển khai

1. **Đóng góp.** Dùng các loại yêu cầu trong `workflow.ts`: đề xuất địa điểm mới, cập nhật, yêu cầu quản lý và báo cáo đánh giá. Làm API gửi, xem danh sách của mình, bổ sung khi được yêu cầu và rút theo trạng thái hợp lệ. Kiểm tra dữ liệu, nguồn ảnh và thông tin bắt buộc theo form hiện có. Cho tác giả xem yêu cầu của mình và chỉ hiển thị thông tin xử lý theo quyền truy cập.
2. **Chủ cơ sở.** Kiểm tra quyền quản lý cho từng địa điểm đã được duyệt. Hỗ trợ gửi cập nhật, xem tiến độ và phản hồi đánh giá của cơ sở được cấp quyền theo màn hiện có. Tài khoản tự đăng ký mặc định là Người dùng. Quyền quản lý có hiệu lực theo quyết định xét duyệt và dừng khi bị thu hồi. Xử lý yêu cầu đang chờ khi quyền bị thu hồi theo nghiệp vụ hiện có.
3. **Quản trị viên.** Làm hàng chờ, xem chi tiết, duyệt, từ chối, yêu cầu bổ sung và thu hồi theo trạng thái. Lưu người xử lý, thời điểm và lý do. Chỉ áp dụng thay đổi công khai sau khi duyệt thành công. Khi quyết định đến từ dữ liệu đã cũ hoặc bị gửi lại, kiểm tra phiên bản hiện tại và tránh cập nhật trùng. Bảo đảm quyết định, lịch sử và thay đổi công khai nhất quán nếu một bước ghi thất bại.
4. **Thay đổi theo thời gian và báo cáo.** Bám các loại thay đổi giờ bán, chuyển tạm/chuyển hẳn, tạm nghỉ và ngừng bán trong `workflow.ts`. Đối chiếu thời điểm hiệu lực theo TP.HCM và việc khôi phục sau khi thay đổi tạm hết hạn. Với báo cáo, áp dụng đúng quyết định giữ, ẩn ảnh hoặc ẩn đánh giá theo phiên bản nội dung đã báo cáo. Phối hợp với Hữu Hiếu để kiểm tra hiển thị trên chi tiết địa điểm.
5. **Nối Angular.** Tái sử dụng ba màn hiện có. Hiển thị đúng trạng thái, lý do và nút thao tác theo dữ liệu máy chủ. Rà việc ngăn truy cập trực tiếp vào màn sai vai trò, đồng thời kiểm tra quyền tương ứng trên API.

## 4. Kiểm thử trước khi mở PR

| Phần | Tình huống cần kiểm tra |
| --- | --- |
| Đóng góp | Gửi, bổ sung, rút đúng trạng thái. Tài khoản khác không xem hoặc sửa yêu cầu riêng. Chưa duyệt thì danh mục công khai chưa đổi. |
| Quyền quản lý | Chủ cơ sở chỉ thao tác với địa điểm được cấp. Duyệt và thu hồi quyền. Phản hồi đúng địa điểm và xử lý yêu cầu đang chờ sau thu hồi. |
| Xét duyệt | Quản trị viên xử lý đúng trạng thái. Người dùng thường bị từ chối. Lưu lý do/lịch sử, quyết định lặp không áp dụng hai lần, phát hiện xung đột khi địa điểm đã đổi. |
| Thời điểm và báo cáo | Thay đổi tạm có hiệu lực và hết hạn đúng thời điểm. Ẩn đúng ảnh hoặc đánh giá được báo cáo. Phiên bản đánh giá mới được xử lý theo quy tắc đã chốt. |
| Trình duyệt | Thử Đóng góp → Quản trị viên xét duyệt → kết quả xuất hiện đúng màn. Kiểm tra tài khoản Chủ cơ sở chỉ thấy phạm vi được cấp trên desktop/mobile. |

Viết Laravel Feature Test trên MySQL test riêng cho quyền, trạng thái, lịch sử và việc duyệt áp dụng dữ liệu. Viết unit test cho logic độc lập mới hoặc sửa, chẳng hạn chuyển trạng thái và tính hiệu lực. Chạy `php artisan test` và, nếu chạm frontend, `npm test`, `npm run build`. Dùng Playwright cho luồng liên quan khi bộ test chung đã sẵn sàng.

## 5. Prompt gửi Codex

```text
Tôi là Triệu Quang Huy, làm Task 5 của haiphamt/TravelGo trên feat/owner-moderation. Đọc rules.md, .github/pull_request_template.md, backend/README.md và docs/OWNER_MODERATION_TASK.md. Nếu file task chưa có trên nhánh này, chạy git fetch origin rồi đọc git show origin/docs/update-team-assignments:docs/OWNER_MODERATION_TASK.md. Kiểm tra git status, nhánh tích hợp và luồng hiện có trong workflow.ts cùng các màn Đóng góp, Chủ cơ sở và Quản trị viên.

Triển khai gửi yêu cầu, quyền quản lý theo từng cơ sở, xét duyệt và lịch sử theo hướng dẫn. Giữ thiết kế Angular. Dùng tài khoản từ phiên xác thực và các quy ước mã địa điểm/đánh giá đã chốt với Tuấn Hải và Hữu Hiếu. Kiểm tra quyền trong mọi thao tác cần quyền, kiểm tra phiên bản trước khi duyệt và bảo đảm cập nhật nhất quán. Khi phụ thuộc chưa sẵn sàng, dùng fixture để kiểm thử và ghi rõ bước nối còn lại.

Thêm và chạy test theo checklist. Rà diff, ghi lệnh, số test, kết quả và phần chưa xác minh. Soạn PR theo mẫu repo để tôi kiểm tra trước khi commit, push và mở PR.
```

## 6. Mở PR và bàn giao

- Rà `git status --short`, `git diff --check`, `git diff --cached --check` và toàn bộ diff. Kiểm tra dữ liệu bằng chứng, tài khoản thử và thay đổi ngoài phạm vi. Push `feat/owner-moderation`, mở PR về nhánh tích hợp. Có thể bàn giao luồng đóng góp và xét duyệt cơ bản trước, rồi nối cập nhật danh mục và báo cáo ở PR liên quan. Dùng Draft nếu phạm vi PR còn kiểm thử hoặc phụ thuộc chưa hoàn tất.
- Tiêu đề gợi ý `feat(moderation): add contributions and owner access review`. Điền **Task liên quan**, **Thay đổi / đầu ra** (quyền, trạng thái, migration, API), **Kiểm tra và minh chứng** (lệnh và kết quả thật, ảnh hai màn nếu có), **Review** (người review, phần AI hỗ trợ và cách đã kiểm tra).
- Mời ít nhất một thành viên khác review và mời Tuấn Hải xem phần Angular. Chia sẻ hợp đồng dữ liệu đã duyệt với Hữu Hiếu, gắn PR vào backlog và cập nhật kết quả test sau review.
