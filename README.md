<p align="center">
  <a href="https://www.uit.edu.vn/" title="Trường Đại học Công nghệ Thông tin">
    <img src="https://i.imgur.com/WmMnSRt.png" alt="Trường Đại học Công nghệ Thông tin | University of Information Technology">
  </a>
</p>

<h1 align="center"><b>IS207.R11 - PHÁT TRIỂN ỨNG DỤNG WEB</b></h1>

## BẢNG MỤC LỤC

- [Giới thiệu môn học](#giới-thiệu-môn-học)
- [Giới thiệu đồ án môn học](#giới-thiệu-đồ-án-môn-học)
- [Thành viên nhóm](#thành-viên-nhóm)

## GIỚI THIỆU MÔN HỌC

- **Tên môn học:** Phát triển ứng dụng web
- **Mã môn học:** IS207.R11
- **Giảng viên hướng dẫn:** ThS. **Tạ Việt Phương**
- **Email:** *phuongtv@uit.edu.vn*

---

## GIỚI THIỆU ĐỒ ÁN MÔN HỌC

- **Tên đề tài:** TravelGo - Nền tảng khám phá địa điểm và lập lịch trình du lịch thông minh
- **Repository:** [haiphamt/TravelGo](https://github.com/haiphamt/TravelGo)
- **Thiết kế Figma:** [TravelGo](https://www.figma.com/design/QYzdMjHKiquZjUAvHUdXhq/TravelGo?node-id=43-2)
- **Mã nguồn frontend:** [Nhánh feat/travelgo-frontend](https://github.com/haiphamt/TravelGo/tree/feat/travelgo-frontend/frontend)
- **Phân công, quy tắc PR và kiểm thử:** [rules.md](https://github.com/haiphamt/TravelGo/blob/feat/travelgo-frontend/rules.md)

TravelGo là đồ án xây dựng nền tảng web hỗ trợ khám phá địa điểm và lập lịch trình đi chơi, du lịch theo thời gian, ngân sách và sở thích. Đợt triển khai hiện tại tập trung vào **TP.HCM**, bao gồm **Góc Địa Phương** để tìm hiểu hàng quán nhỏ và đưa các điểm bán phù hợp vào chuyến đi.

Dự án tập trung vào hành trình **khám phá → cùng lựa chọn → lập lịch trình → mở chỉ đường → chia sẻ trải nghiệm và cập nhật thông tin**. Danh mục địa điểm sử dụng dữ liệu OpenStreetMap. TravelGo tiếp nhận đề xuất cập nhật qua luồng đóng góp và xét duyệt. Liên kết Google Maps dùng để tham khảo và dẫn đường.

**Trạng thái.** Frontend Angular đã được bàn giao trên nhánh `feat/travelgo-frontend`. Backend Laravel, cơ sở dữ liệu MySQL và tích hợp API là phần triển khai tiếp theo.

**Phạm vi chức năng**

- Đăng ký và đăng nhập bằng email hoặc tiếp tục với Google. Tài khoản tự đăng ký bắt đầu ở vai trò Người dùng.
- Tìm kiếm và lọc địa điểm tại TP.HCM theo khu vực, danh mục, giá tham khảo và đánh giá TravelGo.
- Xem thông tin chi tiết, hình ảnh, giờ hoạt động và vị trí địa điểm trên bản đồ.
- Lưu và quản lý danh sách địa điểm yêu thích.
- Dùng chung một hệ thống đánh giá **1–5 sao** cho địa điểm ở TP.HCM, bao gồm Góc Địa Phương. Mỗi tài khoản có thể viết và chỉnh sửa một đánh giá cho mỗi địa điểm, kèm nhận xét và ảnh tùy chọn.
- Khám phá Góc Địa Phương; đề xuất địa điểm, giờ bán và thay đổi điểm bán để quản trị viên xét duyệt; hiển thị thời điểm cập nhật và lưu lịch sử thay đổi.
- Tạo lịch trình thủ công hoặc nhận gợi ý AI từ địa điểm đã có trong TravelGo; tùy chọn ghé hàng quán địa phương tại TP.HCM. Người dùng được sửa, lưu lịch trình và mở Google Maps để dẫn đường.
- Tạo phòng cùng bạn bè, bình chọn và thống nhất địa điểm phù hợp với nhóm.
- Chủ cơ sở có thể đề nghị quyền quản lý địa điểm, cập nhật thông tin và phản hồi đánh giá sau khi được xác minh. Quản trị viên quản lý tài khoản, địa điểm và nội dung vi phạm.

**Ba actor nghiệp vụ** gồm Người dùng, Chủ cơ sở và Quản trị viên. Người dùng có thể truy cập các màn công khai trước khi đăng nhập.

**Tech stack chốt:** Angular (TypeScript) + PHP/Laravel REST API + **MySQL**; Eloquent và migrations cho dữ liệu, Laravel Sanctum cho xác thực, Leaflet để hiển thị bản đồ từ nguồn OSM. Chỉ chọn một hệ quản trị CSDL: **không chạy MySQL và MariaDB song song**. MariaDB là phương án thay thế nếu nhóm quyết định đổi và kiểm thử lại.

Kiến trúc tách lớp trình bày Angular khỏi Laravel API, vận dụng phân tách trách nhiệm MVC. Nhóm sẽ chốt nhà cung cấp AI và phiên bản các công cụ backend khi khởi tạo backend.

**Giới hạn:** chưa triển khai tích điểm đổi quà, quyên góp, đặt món, thanh toán hoặc theo dõi người bán theo thời gian thực. Ảnh demo người bán phải có quyền sử dụng và sự đồng ý công khai; không lấy ảnh của website khác chỉ vì ảnh đang hiển thị công khai.

**Sản phẩm tham khảo** gồm Foody, Google Maps, Wanderlog, TikTok, [Gánh Mưu Sinh .vn](https://ganhmuusinh.vn/) và [Gánh Mưu Sinh .io.vn](https://ganhmuusinh.io.vn/).

---

## THÀNH VIÊN NHÓM

| STT | MSSV | Họ và Tên | Github | Email |
|-----|:----:|-----------|--------|-------|
| 1 | 24520442 | Phạm Tuấn Hải | [haiphamt](https://github.com/haiphamt) | 24520442@gm.uit.edu.vn |
| 2 | 24520013 | Nguyễn Thị Quỳnh Hân | [QuynhHan486](https://github.com/QuynhHan486) | nguyenhan04081999@gmail.com |
| 3 | 24520306 | Phạm Công Định | [Dingglebell](https://github.com/Dingglebell) | dinhphmlp@gmail.com |
| 4 | 24520486 | Chung Minh Hiếu | [chungminhhieu2311-collab](https://github.com/chungminhhieu2311-collab) | chungminhhieu2311@gmail.com |
| 5 | 24520495 | Lê Nguyễn Hữu Hiếu | [lihanhutiu](https://github.com/lihanhutiu) | huuhieu1209@gmail.com |
| 6 | 24520708 | Triệu Quang Huy | [1can5ez](https://github.com/1can5ez) | 24520708@gm.uit.edu.vn |
