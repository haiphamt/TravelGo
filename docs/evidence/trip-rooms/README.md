# Minh chứng Task 4 — Phòng cùng đi

Kiểm tra ngày 15/11/2026 trên Laravel/MySQL với hai tài khoản demo và hai phiên cookie riêng. Desktop 1440×1000, mobile 390×844 bằng Playwright/Chromium.

Luồng đã thử: tạo phòng, tham gia bằng mã, đề xuất, đổi tài khoản khi có phiếu chưa lưu, bình chọn, chốt và chỉnh giờ ghé. Cả hai màn đọc được cập nhật. Request ghi thiếu CSRF bị từ chối; không có lỗi JavaScript hoặc tràn ngang.

- desktop-voting.png và mobile-voting.png: bình chọn theo từng tài khoản.
- desktop-result.png và mobile-result.png: kết quả giữ thứ tự, giờ chỉnh được đồng bộ.
- result.json: tóm tắt kết quả lượt chạy.

Tên và mã phòng trong ảnh là dữ liệu kiểm thử. Phiên đăng nhập được thiết lập bằng bộ hỗ trợ localhost ngoài repository, chỉ trên database travelgo_test; không có endpoint đăng nhập thử trong mã bàn giao. Các ảnh không xác nhận phần email/Google login hoặc sao chép sang lịch trình cá nhân đã tích hợp xong.

Kiểm tra kèm theo: 27 test backend (258 assertions), 51 test frontend đạt; Angular build thành công với cảnh báo bundle 709.19 kB/700 kB và Leaflet CommonJS. Hợp đồng và phụ thuộc xem backend/docs/TRIP_ROOMS_API.md.
