# Minh chứng sao chép lịch trình phòng — Quỳnh Hân

Kiểm tra 15/11/2026 bằng Playwright/Edge headless trên desktop 1440×1000 và mobile 390×844. Dùng hai phiên cookie và hai tài khoản fixture trên Laravel/MySQL `travelgo_test`; không phải đăng nhập email/Google thật. Tên địa điểm, tên phòng, tài khoản trong ảnh đều là dữ liệu demo tự tạo.

- [Desktop: phòng đã lưu bản cá nhân](desktop-room.png), [mobile: phòng](mobile-room.png): nút lưu dùng API thật, giữ thứ tự và giờ lịch trình nhóm đang chỉnh.
- [Desktop: bản cá nhân mở lại](desktop-personal.png), [mobile: bản cá nhân](mobile-personal.png): người dùng đã đổi thứ tự trên bản riêng, phòng không thay đổi. Cảnh báo giờ chưa tăng dần là kết quả mong đợi sau thao tác đảo thứ tự, không phải lỗi sao chép.

Ca trình duyệt cho máy chủ ghi bản sao xong rồi ngắt phản hồi. Lần thử lại trả cùng UUID, không tạo bản trùng. Thành viên thứ hai lưu bản có UUID riêng và không đọc được bản của tài khoản thứ nhất. Request thiếu CSRF bị từ chối. Sau reload, kiểm tra giao diện đã hiện đúng tên, thứ tự API đã lưu, không có lỗi JavaScript hoặc tràn ngang.

Kết quả trên mã ứng dụng cuối: 67 test backend/459 assertions, 62 test frontend, 8 ca trình duyệt đạt. Hai ca sao chép được chạy lại sau khi bổ sung chờ giao diện tải xong trước chụp ảnh; đều đạt. Build thành công, còn warning 718.17 kB/700 kB và Leaflet CommonJS. Cách chạy: `backend/docs/ROOM_ITINERARY_COPY.md` và `frontend/playwright.config.ts`.

Ảnh không xác nhận các phần đang chờ: đăng nhập thật, provider AI thật, chính sách địa điểm ẩn/đóng cửa và phiên bản thay đổi được duyệt. Không có token hoặc mật khẩu trong ảnh.
