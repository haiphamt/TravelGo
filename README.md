# IS207 — Main Project

Repository đồ án chính môn **Phát triển ứng dụng web — IS207.R11**, nhóm **PHP Is Awesome**, lớp thực hành **TH.2**.

## Trạng thái

**Giai đoạn hiện tại: xác định đề tài và chuẩn bị báo cáo TH2.** Tên sản phẩm, phạm vi nghiệp vụ và ngày báo cáo TH2 đang chờ nhóm xác nhận. Repository dùng tên môn học và có thể đổi tên khi đề tài được chốt.

Repository này hiện chứa tài liệu khởi tạo. Ứng dụng PHP và cơ sở dữ liệu chưa được triển khai; chưa có demo hoặc hướng dẫn chạy một hệ thống hoàn chỉnh.

## Liên kết

- [Project Hub chung trên Notion](https://app.notion.com/p/3ee533490aed81719583de1253e9cb2d)
- [Project chính — Board và checklist TH2](https://app.notion.com/p/3ee533490aed8193a1a6cb261a1391e7)
- [Repository Mini Project — MajorWeave](https://github.com/haiphamt/majorweave-mini-project)
- [Thỏa thuận và đóng góp](https://app.notion.com/p/3ee533490aed8146a1d1c3cee0c0bd5f)

## Nhóm thực hiện và phân công TH2

| Thành viên | Phần phụ trách |
|---|---|
| Phạm Tuấn Hải | Điều phối, chốt phạm vi, tích hợp và duyệt cuối |
| Nguyễn Thị Quỳnh Hân | Nhu cầu thị trường, khách hàng, đối thủ và đề xuất đề tài |
| Phạm Công Định | Project Charter, SOW, yêu cầu và luồng nghiệp vụ |
| Chung Minh Hiếu | Định vị thương hiệu, palette, logo, typography và style guide |
| Lê Nguyễn Hữu Hiếu | Sitemap, sketch/wireframe và mockup trang chủ |
| Triệu Quang Huy | Repository/giới thiệu, WBS/tiến độ và gói báo cáo TH2 |

Phân công là kế hoạch, chưa phải xác nhận đóng góp đã hoàn thành. Mỗi thành viên dùng tài khoản Git riêng; liên kết commit/PR và minh chứng vào task `MAxx` trên Notion.

## Yêu cầu công nghệ của môn học

- Backend chính: **PHP**.
- Cơ sở dữ liệu chính: **MySQL/MariaDB**.
- Mã nguồn thể hiện phân tách trách nhiệm **Model — View — Controller**.
- Frontend: HTML, CSS, JavaScript hoặc thư viện/framework phù hợp; stack cụ thể chờ nhóm quyết định.
- Node/npm có thể dùng cho công cụ build frontend. Node.js, Python và Java trong mini là các hướng học của sinh viên, không quyết định backend của đồ án chính.

## Mục tiêu báo cáo TH2

Xem [checklist chi tiết](docs/TH2_CHECKLIST.md): đề tài/thị trường, nhận diện, Charter/SOW và quản lý dự án, repository/trang giới thiệu, sketch/mockup trang chủ và sitemap.

## Quy trình đóng góp

1. Nhận task trên Notion, ghi đầu ra và tiêu chí hoàn thành.
2. Tạo branch theo công việc, ví dụ `docs/ma04-project-charter`.
3. Commit có ý nghĩa, mở Pull Request và gắn mã task.
4. Thành viên khác kiểm tra; chỉ ghi hoàn thành sau khi có review và bằng chứng.
5. Cập nhật README với đề tài, kiến trúc, cấu hình/chạy, SQL/seed và demo khi các phần đó được hiện thực.

Không đưa secret hoặc thông tin đăng nhập thật vào repository. Khi dùng AI, lưu các quyết định và cách xác minh kết quả thực tế trong AI Development Log của nhóm.

## Cấu trúc hiện tại

```text
README.md                Giới thiệu và trạng thái đồ án
docs/TH2_CHECKLIST.md     Checklist và đầu ra báo cáo TH2
.github/                 Mẫu Pull Request
```

## Kiến trúc, dữ liệu và vận hành

Kiến trúc, ERD, module và quy trình triển khai sẽ được bổ sung sau khi chốt đề tài/SOW. Hướng dẫn cài đặt/chạy, cấu hình môi trường, migration/SQL/seed, tài khoản demo và kết quả kiểm thử phải phản ánh hệ thống thực tế.
