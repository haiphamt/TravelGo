# Sao chép phòng sang lịch trình cá nhân

Phần bổ sung Task 3 của Quỳnh Hân, dựa trên lõi phòng PR #7 của Công Định tại `e70e380`. Hợp đồng này đã được triển khai và kiểm thử trong nhánh Hân; cần Định và người phụ trách frontend review trước khi nhóm nghiệm thu. Không khẳng định đã có xác nhận của đồng đội.

## Request và phản hồi

`POST /api/itineraries/from-room`, cùng origin, session Laravel + CSRF như API lịch trình. Giới hạn 30 request/phút. Body:

```json
{"roomCode":"AB123456","roomRevision":7}
```

Trả **200** `{data: SavedTrip}` cho cả lần tạo đầu và lần gọi lại, có UUID, `version`, `source: "room"` và `points`. Không nhận người sở hữu, điểm ghé, tên chuyến đi hay snapshot từ trình duyệt. Các trường ngoài hợp đồng không có tác dụng cấp quyền hoặc thay dữ liệu.

| Kiểm tra | Hành vi |
| --- | --- |
| Tài khoản | Phải đăng nhập và là thành viên phòng, gồm cả chủ phòng. Bản cá nhân thuộc chính người đăng nhập. |
| Phòng | Phải đã chốt và `roomRevision` khớp. Trạng thái hoặc phiên bản cũ trả 409 để tải lại. Người ngoài nhận 403, mã không tồn tại nhận 404, đầu vào sai nhận 422. |
| Nguồn điểm ghé | Đọc `itinerary ?? result` trên máy chủ trong khi giữ khóa hàng phòng. Giữ nguyên thứ tự, `placeId`, giờ ghé, snapshot và `keptRevision`. Không sửa kết quả hay lịch trình nhóm. |
| Tên/ngày | Lấy tên phòng và ngày phòng; không tự điền ngân sách hoặc chi phí. |
| Địa điểm | Bản sao mới yêu cầu các mã còn tồn tại, thuộc `hcm`. Nếu không, trả 422 và không lưu một phần; chủ phòng cần thay/bỏ điểm trước khi lưu lại. |
| Gọi lại | Cùng người + phòng + phiên bản trả cùng UUID, giữ các chỉnh sửa cá nhân đã lưu. Khóa hàng và khóa duy nhất bảo vệ hai request đồng thời. |
| Phiên bản mới | Sau khi chủ phòng chỉnh lịch trình nhóm, lưu phiên bản mới tạo một bản riêng mới; không ghi đè bản cũ. |
| Xóa bản cá nhân | Xóa cả dấu sao chép liên quan; thành viên có thể lưu lại cùng phiên bản phòng. |
| Chỉnh bản cá nhân | Dùng PUT lịch trình hiện có, giữ `source: room`, phân quyền và `version`; sửa bản riêng không tác động phòng. POST lịch trình thường vẫn không cho tự gắn `source: room`. |

Thông tin đã lưu có thể khác hồ sơ hiện tại. Sao chép giữ snapshot của phòng để không âm thầm đổi kế hoạch; `null` cho giá, giờ hoặc tọa độ vẫn giữ `null`, giá 0 vẫn là 0. `keptRevision` là dấu người dùng đã chọn giữ thông tin cũ, không phải chứng nhận dữ liệu đã được duyệt. Chính sách địa điểm ẩn/đóng cửa và phiên bản được duyệt vẫn chờ hợp đồng chung của địa điểm/xét duyệt, giống phần lõi phòng. Không tự đặt trạng thái công khai mới.

## Migration và Angular

Chạy `php artisan migrate` sau khi có migration places, itineraries và trip_rooms. Migration mới thêm cột nullable `itinerary_stops.kept_revision` và bảng `itinerary_room_copies`; không sửa/xóa các lịch trình đã lưu. Dấu sao chép giữ khóa ngoại và phiên bản nguồn phòng ở máy chủ.

Giữ bố cục/CSS/ảnh. Nút **Lưu một bản lịch trình cá nhân** hiện có gọi API này khi `itinerary-config.json` dùng `storage: "api"`. Lỗi không ghi một bản demo thay thế. Trước khi gửi, adapter kiểm tra phiên tài khoản và người đang thao tác trong phòng; đổi tài khoản yêu cầu tải lại. Thành công đưa bản trả về vào Lịch trình của tôi; gọi lại cùng bản không tạo dòng trùng trong danh sách. Chế độ demo mặc định vẫn được giữ trong lúc auth/danh mục thật chưa vào nhánh tích hợp.

## Kiểm tra

- Feature test: quyền thành viên, phòng chưa chốt/phiên bản cũ, nguồn server, snapshot cũ/null/0, hai tài khoản, chỉnh độc lập, gọi lại/xóa/lưu phiên bản mới, điểm không hợp lệ và rollback khi ghi lỗi.
- Hai PHP process cùng sao chép một phòng/phiên bản chỉ tạo một lịch trình và một dấu sao chép trên MySQL test.
- Unit test adapter: payload chỉ có tham chiếu phòng, CSRF, đổi tài khoản, phòng cũ, mất phản hồi và giữ metadata.
- Playwright desktop/mobile: hai phiên cookie, mất phản hồi sau khi MySQL đã ghi rồi thử lại, sao chép riêng cho hai thành viên, mở lại/chỉnh thứ tự và kiểm tra phòng giữ nguyên. Chạy `npm run test:itineraries`, dùng schema `travelgo_test` riêng; không chạy cùng PHPUnit.
