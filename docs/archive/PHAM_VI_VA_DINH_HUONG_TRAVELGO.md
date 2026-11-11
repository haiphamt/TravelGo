# TravelGo — Phạm vi và định hướng triển khai

> **Tài liệu lưu trữ.** Bản định hướng tháng 10 ghi lại quyết định tại thời điểm lập. Xem [README hiện hành](../../README.md#giới-thiệu-đồ-án-môn-học) để biết phạm vi và trạng thái triển khai.

**Ngày chốt:** 17/10/2026. **Học phần:** IS207.R11 — Phát triển ứng dụng web. **Giảng viên:** ThS. Tạ Việt Phương. **Loại đồ án:** Project chính. **Nhóm:** 6 thành viên, danh sách tại [README](../../README.md#thành-viên-nhóm).

Tài liệu ghi nhận các quyết định sau thảo luận của nhóm về đánh giá, Góc Địa Phương, actor, đối thủ và công nghệ. Đây là căn cứ cập nhật yêu cầu, Figma và kế hoạch lập trình; không phải biên bản nghiệm thu phần mềm. Tại thời điểm cập nhật, repository chưa có mã nguồn ứng dụng Angular/Laravel. Tài liệu có sử dụng AI hỗ trợ tổng hợp; nhận định cạnh tranh được giới hạn theo nguồn công khai đã kiểm tra.

## 1. Định vị và phạm vi

**Tên đề tài:** TravelGo — Nền tảng khám phá địa điểm và lập lịch trình du lịch thông minh.

**Bài toán trọng tâm:** hỗ trợ người dùng, đặc biệt nhóm bạn đi chơi ngắn ngày, chọn địa điểm phù hợp với thời gian, ngân sách và sở thích; thống nhất lựa chọn, lập lịch trình có thể chỉnh sửa và thuận tiện mở chỉ đường. Nhóm sinh viên/bạn trẻ là phân khúc mục tiêu đề xuất, cần kiểm chứng qua khảo sát, không phải kết luận nghiên cứu thị trường đã hoàn thành.

- Khám phá và lập lịch trình tại **TP.HCM và Đà Lạt**. Không đưa Hà Nội, Đắk Lắk hoặc phạm vi toàn quốc vào đợt triển khai đầu.
- **Góc Địa Phương triển khai tại TP.HCM trước**, tập trung hàng quán nhỏ, gánh hàng và món ăn địa phương phù hợp chuyến đi. Chưa mở rộng sang đồ chơi, sửa chữa hoặc các dịch vụ không liên quan đến phạm vi ăn uống/du lịch.
- Có tìm kiếm, lọc, yêu thích, chi tiết địa điểm, đánh giá, đóng góp thông tin, phòng cùng lựa chọn, lịch trình thủ công và gợi ý AI.
- Góc Địa Phương là nhóm địa điểm trong cùng hệ thống: cùng hồ sơ địa điểm, cùng đánh giá và cùng khả năng thêm vào lịch trình; không phải một website hoặc một kho đánh giá tách rời.
- Không tuyên bố TravelGo có đánh giá đáng tin hơn Google/TikTok hay ý tưởng hoàn toàn mới khi chưa có bằng chứng. Giá trị cần kiểm chứng là khả năng giúp nhóm chốt và tổ chức chuyến đi, có thể kết hợp trải nghiệm địa phương.

## 2. Ba actor nghiệp vụ

| Actor | Quyền và mục tiêu chính | Giới hạn |
|---|---|---|
| Người dùng | Khám phá, lưu yêu thích, đánh giá, đề xuất thông tin, tạo/tham gia phòng chọn điểm đến, lập và quản lý lịch trình | Cần đăng nhập cho thao tác ghi dữ liệu cá nhân/cộng đồng; không tự duyệt đề xuất |
| Chủ cơ sở/Người bán | Gửi yêu cầu quản lý địa điểm; sau khi được xác minh, quản lý nội dung thuộc phạm vi được cấp và phản hồi đánh giá | Không quản lý địa điểm của người khác; không sửa sao hay tự xóa nhận xét bất lợi |
| Quản trị viên | Xác minh quyền quản lý; duyệt địa điểm và thay đổi thông tin; xử lý báo cáo, tài khoản và nội dung vi phạm | Phải lưu lý do xử lý và lịch sử thay đổi; không coi số sao thấp là lý do gỡ bài |

Khách chưa đăng nhập và người đã đăng nhập thuộc cùng actor Người dùng; khác nhau ở điều kiện truy cập. Chủ phòng là quyền trong một phòng, không dùng để thay actor nghiệp vụ thứ ba. AI và Google Maps là dịch vụ hỗ trợ, không dùng để bù số actor theo yêu cầu của giảng viên.

Luồng chứng minh actor Chủ cơ sở/Người bán: **gửi yêu cầu quản lý → quản trị viên xác minh, duyệt hoặc từ chối có lý do → cấp quyền cho đúng địa điểm → cập nhật thông tin/phản hồi đánh giá**. Yêu cầu đăng ký không tự sinh quyền chủ cơ sở. Quyền phải được kiểm tra tại backend, không chỉ ẩn nút ở giao diện.

Không bắt người bán lớn tuổi phải có tài khoản để được giới thiệu. Nhóm có thể hỗ trợ nhập thông tin khi được đồng ý; nếu có người đại diện quản lý phải xác minh sự ủy quyền. Việc một điểm bán chưa có tài khoản chủ cơ sở không ngăn nó xuất hiện trong Góc Địa Phương sau khi được duyệt.

## 3. Một hệ thống đánh giá riêng của TravelGo

Áp dụng thống nhất cho địa điểm tại TP.HCM, Đà Lạt và Góc Địa Phương; không nhập điểm hay nhận xét Google vào điểm TravelGo.

| Nội dung | Quy tắc chốt |
|---|---|
| Số sao | Người dùng chọn số nguyên từ 1 đến 5; sửa giao diện đang thiếu sao hoặc hiển thị điểm cá nhân không thống nhất |
| Nhận xét, hình ảnh | Tùy chọn; gợi ý ghi món đã mua, giá tham khảo, thời điểm ghé và lưu ý thực tế; ảnh phải có quyền sử dụng |
| Số lượng bài | Một đánh giá đang tồn tại cho mỗi cặp tài khoản–địa điểm; được sửa/xóa bài của mình, không tạo nhiều bài để tăng điểm |
| Điểm tổng hợp | Trung bình số sao của các đánh giá còn hiển thị hợp lệ, làm tròn một chữ số thập phân; hiển thị đồng thời tổng số đánh giá |
| Chưa có dữ liệu | Hiển thị “Chưa có đánh giá”; không mặc định 5 sao, không dùng sao mẫu như dữ liệu thực |
| Cách trình bày | Tách lượt chỉ chấm sao khỏi bài có nội dung khi cần; hiển thị tên, ngày đăng/cập nhật; ghi rõ đây là đánh giá TravelGo |
| Phản hồi và báo cáo | Chủ cơ sở phản hồi; người dùng báo vi phạm; quản trị viên xử lý có lý do và khả năng đối chiếu lịch sử |

Nhận xét về trải nghiệm và đề xuất thay đổi dữ liệu là hai nghiệp vụ khác nhau. Một bình luận “đã chuyển chỗ” không tự sửa tọa độ; người dùng được hướng sang luồng đề xuất cập nhật.

Không gắn nhãn “đã ghé được xác minh” chỉ vì có đánh giá, ảnh, tọa độ, bấm “đã ghé” hoặc mở chỉ đường. Không đánh giá hoàn cảnh khó khăn của người bán bằng số sao. Địa điểm mới có ít nhận xét vẫn được xét theo độ phù hợp nhu cầu, không tự bị loại vì chưa có sao.

**Chưa triển khai level, bảng đua điểm hay đổi quà.** Hồ sơ có thể hiển thị số đánh giá và số đề xuất được duyệt. Không thưởng cho việc chấm 5 sao hoặc đăng lại cùng nội dung. Nếu sau này có tài trợ, chương trình hỗ trợ cần quy trình riêng; không xem điểm đóng góp là bằng chứng đã mua hàng hay quyền nhận tiền/quà.

Các biện pháp nền tảng khi triển khai: xác thực, giới hạn tần suất gửi, kiểm tra nội dung/tệp tải lên, chặn trùng theo tài khoản–địa điểm và xử lý báo cáo. Các biện pháp này giảm lạm dụng, không được quảng bá là loại bỏ hoàn toàn đánh giá giả.

## 4. Góc Địa Phương và điểm bán thay đổi

Một số gánh hàng cố định, một số đổi chỗ theo ngày hoặc theo khung giờ. Hồ sơ gánh hàng cần ổn định dù vị trí bán thay đổi; đánh giá và lịch sử vẫn gắn với cùng hồ sơ.

Thông tin tối thiểu: tên hiển thị được người bán đồng ý, món bán/danh mục, giá tham khảo nếu biết, ảnh được phép sử dụng, khu vực và tọa độ điểm bán, giờ thường bán, loại điểm bán cố định/di chuyển, ngày ghi nhận, nguồn và ngày xác nhận gần nhất. Trường chưa biết phải thể hiện là chưa có thông tin, không tự bịa.

Luồng cập nhật:

1. Người dùng hoặc người bán gửi đề xuất kèm thời điểm ghi nhận; phân biệt đổi chỗ tạm thời, chuyển điểm bán thường xuyên, thay đổi giờ, tạm nghỉ hoặc ngừng hoạt động.
2. Đề xuất ở trạng thái chờ duyệt; chưa ghi đè dữ liệu đang công bố. Quản trị viên kiểm tra bằng nguồn phù hợp, có thể yêu cầu bổ sung hoặc liên hệ người bán.
3. Khi được duyệt, lưu thông tin cũ/mới, thời điểm áp dụng, người xử lý và lý do; đề xuất bị từ chối giữ lý do để người gửi biết.
4. Lịch trình đã lưu có địa điểm thay đổi hiển thị cảnh báo và cho người dùng chọn cập nhật hoặc thay thế. Không âm thầm thay điểm hay thứ tự chuyến đi.
5. Với thông tin cũ hoặc chưa chắc chắn, hiển thị lưu ý cần kiểm tra trước khi ghé. Không trình bày một báo cáo cũ như trạng thái trực tiếp hiện tại.

Góc Địa Phương có thể được lọc theo món và khoảng giá; AI chỉ đưa vào lịch trình khi phù hợp yêu cầu hoặc người dùng chọn ưu tiên trải nghiệm địa phương. Không ép thêm điểm vì mục tiêu nhân văn nếu trái ngân sách, thời gian hay nhu cầu.

## 5. Nguồn dữ liệu, AI và chỉ đường

### Dữ liệu đầu vào

- **Nguồn dataset địa điểm bên ngoài:** OSM, giới hạn khu vực TP.HCM và Đà Lạt. Cần kiểm kê độ phủ, trường dữ liệu và thời điểm trích xuất trước khi công bố số lượng địa điểm; chưa mặc định OSM chứa mọi gánh hàng được thấy trên Google.
- **Dữ liệu bổ sung của TravelGo:** khảo sát độc lập, nội dung người bán đồng ý cung cấp và đóng góp cộng đồng có kiểm duyệt. Tọa độ từ OSM hoặc ghi nhận độc lập; không lấy dữ liệu Google rồi đổi nhãn thành OSM.
- **Không sử dụng:** Google Places API, scraping Google Maps hoặc nhập hàng loạt ảnh/nhận xét/điểm Google hay dữ liệu của hai website Gánh Mưu Sinh.
- Lưu nguồn và thời điểm cập nhật, xử lý trùng giữa nguồn OSM và đóng góp; dữ liệu OSM cần ghi nguồn và tuân thủ ODbL. Giấy phép dữ liệu không đồng nghĩa mọi ảnh liên quan đều được phép tái sử dụng. [Giấy phép OSM](https://www.openstreetmap.org/copyright)

### Gợi ý lịch trình

Laravel lọc các địa điểm hợp lệ trong dữ liệu TravelGo theo thành phố, nhu cầu, ngân sách và dữ liệu giờ bán đang có, rồi cung cấp danh sách ứng viên cho AI. AI gợi ý lịch trình bằng mã địa điểm có thật trong danh sách; backend kiểm tra kết quả trước khi lưu. Không cho AI bịa địa điểm, giá, giờ mở cửa, đánh giá hoặc hoàn cảnh người bán.

Người dùng được xem lý do gợi ý, thêm/bỏ/sắp xếp lại điểm và lưu kế hoạch. Khi AI không khả dụng hoặc dữ liệu chưa đủ, vẫn có thể tạo lịch trình thủ công. Nhà cung cấp/model AI chưa chốt; tích hợp qua Laravel, giữ khóa ở máy chủ, không đưa khóa vào Angular hoặc GitHub. Không gửi thông tin cá nhân không cần thiết cho nhà cung cấp AI.

**Lịch trình không đồng nghĩa tuyến đường tối ưu.** Bản đầu sắp xếp lịch trình dựa trên dữ liệu hiện có và cho người dùng chỉnh sửa; không hứa có thời gian giao thông trực tiếp, đường đi chính xác hoặc tối ưu toàn cục. Nếu sau này cần tính quãng đường ngay trong TravelGo, bổ sung bộ tính đường dùng OSM như OSRM sau khi chọn phương án vận hành; chưa coi đó là thành phần bắt buộc đã triển khai.

### Vai trò của Google Maps

Nút “Dẫn đường” mở Google Maps bằng Maps URLs với tọa độ trong TravelGo. Đây là chuyển người dùng sang dịch vụ dẫn đường, không lấy kết quả Google về website và không cần Places API/API key. Một ghim tọa độ không tự tạo hồ sơ doanh nghiệp hoặc đánh giá Google. [Google Maps URLs](https://developers.google.com/maps/documentation/urls/get-started)

Hỗ trợ mở từng chặng làm phương án cơ bản. Có thể mở nhiều điểm khi nền tảng hỗ trợ: Google Maps URLs có giới hạn điểm dừng tùy nền tảng, giữ thứ tự điểm truyền vào và không tự tối ưu thứ tự cho TravelGo. Không cam kết đường/thời gian hiển thị trên Google giống ước tính của TravelGo. Chưa lấy tuyến đường, kilomet hay thời gian Google về hiển thị nội bộ.

## 6. Ảnh và dữ liệu demo

Demo cần hình ảnh đủ rõ về món bán, quầy hàng và bối cảnh để giải thích nghiệp vụ. Có thể có ảnh người bán trước quán nếu được đồng ý; không bắt buộc lộ mặt người bán để chứng minh tính nhân văn.

- Ưu tiên ảnh nhóm tự chụp và được đồng ý đăng công khai; ảnh được tác giả/người bán cho phép dùng với phạm vi rõ ràng; hoặc ảnh có giấy phép phù hợp.
- Phân biệt đồng ý chụp với đồng ý đưa lên website/GitHub công khai. Có đầu mối yêu cầu sửa/gỡ; không công khai giấy tờ, địa chỉ nhà hay thông tin riêng tư không cần thiết.
- Ghi tác giả/nguồn, phạm vi sử dụng, ngày ghi nhận và trạng thái cho phép. Bằng chứng đồng ý và thông tin liên hệ riêng phải lưu ngoài repository công khai; GitHub chỉ nhận tài sản được phép công bố.
- Không tải ảnh từ Google Maps, TikTok hoặc hai trang Gánh Mưu Sinh để làm tài sản của TravelGo khi chưa có quyền. Dữ liệu giả lập/ảnh minh họa phải gắn nhãn, không gắn danh tính hoặc hoàn cảnh giả vào người thật.
- Có thể bắt đầu với 15–20 điểm tại một khu vực TP.HCM để kiểm chứng luồng; đây là quy mô thử nghiệm đề xuất, chưa phải dữ liệu đã thu thập.

**Trong lần cập nhật này chưa bổ sung ảnh người bán hoặc dataset.** Khảo sát, xin phép và kiểm tra dữ liệu là công việc tiếp theo, không được đánh dấu đã hoàn thành.

## 7. Đối thủ và sản phẩm tham khảo

Đối chiếu ngày 17/10/2026, dựa trên nội dung công khai. Bảng dưới là phân tích phần giao nhau với TravelGo, không phải kiểm toán toàn bộ chức năng, dữ liệu hoặc cơ chế chống gian lận của các nền tảng.

| Nền tảng | Phần giao nhau quan sát được | Hướng đối chiếu cho TravelGo |
|---|---|---|
| [Foody](https://www.foody.vn/gioi-thieu) | Tìm/lọc địa điểm ăn uống, ảnh và đánh giá theo tiêu chí | Đối thủ ở khâu khám phá và chọn hàng quán; phân loại món ăn không phải khác biệt riêng |
| [Google Maps](https://developers.google.com/maps/documentation/places/web-service/reference/rest/v1/places) | Thông tin địa điểm, đánh giá và dẫn đường | Vừa là lựa chọn thay thế để tra cứu vừa là dịch vụ dẫn đường bên ngoài; TravelGo không nhập dữ liệu Google |
| [Wanderlog](https://wanderlog.com/) | Lịch trình, bản đồ, cộng tác nhóm và quản lý chi phí | Đối thủ gần ở bài toán lập kế hoạch; không tuyên bố AI, lịch trình nhóm hay xuất Google Maps là sáng tạo độc quyền |
| [TikTok](https://ads.tiktok.com/business/en/guides/travel-and-advertising-guide) | Khám phá và tham khảo trải nghiệm qua nội dung video | Kênh thay thế/bổ trợ để lấy cảm hứng; không mặc định video là giả hoặc nền tảng không có công cụ lập kế hoạch |
| [Gánh Mưu Sinh .vn](https://ganhmuusinh.vn/) | Danh bạ hàng quán, danh mục món, bản đồ, đề xuất, đánh giá cộng đồng và liên kết Google | Giao nhau trực tiếp với Góc Địa Phương. [Điều khoản](https://ganhmuusinh.vn/terms.html) và [quyền riêng tư](https://ganhmuusinh.vn/privacy.html) công bố tách đánh giá nội bộ/Google; không suy ra toàn bộ dữ liệu đến từ OSM chỉ từ dòng ghi nguồn |
| [Gánh Mưu Sinh .io.vn](https://ganhmuusinh.io.vn/) | Bảng tin cập nhật, bản đồ quanh đây, hồ sơ gánh hàng, check-in chờ duyệt, điểm đóng góp và xếp hạng | Giao nhau cả ở cập nhật tình trạng hàng quán; không coi cập nhật cộng đồng là điểm khác biệt riêng của TravelGo |

### Nhận xét riêng về ganhmuusinh.io.vn

- Trên giao diện công khai có thời điểm check-in gần nhất, trạng thái như nghỉ bán/đã mua, phân biệt hồ sơ có/chưa có địa chỉ đối chiếu. Đây là cách thể hiện độ mới và độ thiếu của thông tin đáng tham khảo.
- Trang công bố check-in đủ điều kiện được cộng 1 điểm, gánh mới được duyệt được cộng 10 điểm một lần cho mỗi gánh; điểm tháng dùng xếp hạng, điểm tích lũy dùng cấp độ. Đây là quy tắc được hiển thị, chưa phải bằng chứng hệ thống chống được gian lận hoặc có đổi quà. [Trang chủ](https://ganhmuusinh.io.vn/)
- Luồng [check-in](https://ganhmuusinh.io.vn/checkin) có ảnh, lời nhắn tùy chọn và nhắc xin phép. [Chính sách quyền riêng tư](https://ganhmuusinh.io.vn/privacy) phân biệt đồng ý chụp/đăng, yêu cầu hạn chế lộ thông tin riêng, công bố check-in chờ duyệt và trạng thái chỉ phản ánh lúc ghi nhận. Đây là cam kết công khai của họ; chưa kiểm tra việc thực thi phía máy chủ.
- Qua trang chủ, check-in và quyền riêng tư đã xem, chưa thấy luồng lập lịch trình kết hợp nhiều điểm theo ngân sách/nhóm bạn. Chỉ ghi nhận phạm vi quan sát này, không kết luận toàn bộ sản phẩm không có chức năng đó.
- Hai tên miền `.vn` và `.io.vn` được đánh giá riêng; chưa xác minh quan hệ giữa hai đơn vị. Không coi một trang là bản sao hoặc suy luận nguồn tài trợ, độ tin cậy từ tên miền.

**Định vị lựa chọn của TravelGo:** phục vụ chuyến đi ngắn ở TP.HCM/Đà Lạt, kết hợp lựa chọn theo nhóm và lịch trình có thể chỉnh sửa; tại TP.HCM có thể ghé hàng quán địa phương, kèm cảnh báo khi thông tin điểm bán thay đổi. Đây là trọng tâm thiết kế để kiểm chứng, không phải lợi thế thị trường đã được chứng minh. Không sao chép bố cục, nội dung, thương hiệu hoặc ảnh đối thủ.

## 8. Tech stack và cách mô tả kiến trúc

| Thành phần | Quyết định |
|---|---|
| Frontend | **Angular + TypeScript**, ứng dụng web thích ứng máy tính/điện thoại, giao tiếp REST API |
| Backend | **PHP + Laravel**, một ứng dụng backend, xử lý nghiệp vụ, kiểm tra dữ liệu, phân quyền và API |
| CSDL | **MySQL**, dùng `utf8mb4`; Eloquent ORM, migrations và seed dữ liệu có nguồn |
| Xác thực | **Laravel Sanctum** cho SPA; ưu tiên cookie/session với CSRF, cấu hình triển khai frontend/API cùng miền gốc phù hợp |
| Bản đồ trong TravelGo | **Leaflet + nguồn bản đồ dựa trên OSM**, ghi nguồn đúng quy định; nhà cung cấp tile được cấu hình riêng |
| Chỉ đường | **Google Maps URLs**, mở ứng dụng/trang Google; không dùng Google Places API |
| AI | Gọi từ Laravel; nhà cung cấp/model và ngân sách chưa chốt; có tạo lịch trình thủ công khi lỗi |
| Quản lý mã nguồn, giao diện | Git/GitHub và Figma |

**Chọn MySQL, không chọn cả MySQL và MariaDB.** Laravel hỗ trợ cả hai, nhưng đó là hai lựa chọn hệ quản trị; đồ án không có nhu cầu vận hành và đồng bộ hai hệ song song. MariaDB chỉ là phương án thay thế nếu nhóm đổi quyết định và kiểm thử migration/truy vấn lại. Không ghi dùng MySQL nếu môi trường thực tế đang chạy MariaDB. [Laravel Database](https://laravel.com/docs/13.x/database)

Chưa khởi tạo dự án nên chưa khóa số phiên bản Angular, PHP, Laravel, MySQL hoặc nhà cung cấp AI. Khi khởi tạo, chọn các bản ổn định còn hỗ trợ, kiểm tra tương thích, thống nhất toàn nhóm và ghi lại phiên bản/lockfile; không coi đường dẫn tài liệu Laravel 13.x là cấu hình đã cài đặt.

### MVC trong ứng dụng tách frontend/backend

- **Model:** Eloquent models, quan hệ và thao tác dữ liệu nghiệp vụ trong Laravel.
- **Controller:** Laravel controllers tiếp nhận request, phối hợp kiểm tra dữ liệu, phân quyền và nghiệp vụ, trả JSON.
- **View/lớp trình bày cấp hệ thống:** Angular components/templates hiển thị dữ liệu và nhận thao tác người dùng qua API.

Cách mô tả chính xác: **“TravelGo sử dụng Angular cho lớp trình bày và PHP/Laravel REST API cho backend, vận dụng phân tách trách nhiệm MVC.”** Về triển khai đây là kiến trúc client–server tách frontend/backend, không phải Laravel render toàn bộ View bằng Blade. API trả JSON không tự trở thành View HTML. Không gọi đây là Model–View–Presenter và không coi MVP là một mức độ hoàn thiện của MVC.

**Điểm cần đối chiếu với giảng viên:** yêu cầu MVC của môn có chấp nhận View tách bằng Angular hay bắt buộc View do PHP/Blade render. Stack trên là quyết định triển khai của nhóm; chưa ghi nhận giảng viên phê duyệt riêng cách tách View này.

Tham khảo chính thức: [Angular](https://angular.dev/overview), [Laravel Controllers](https://laravel.com/docs/13.x/controllers), [Eloquent](https://laravel.com/docs/13.x/eloquent), [Views](https://laravel.com/docs/13.x/views), [Sanctum SPA](https://laravel.com/docs/13.x/sanctum#spa-authentication), [Leaflet](https://leafletjs.com/).

OSM là dữ liệu mở, không phải cam kết hạ tầng bản đồ miễn phí vô hạn. Khi triển khai cần tuân thủ chính sách tile, không tải hàng loạt tile từ máy chủ công cộng để làm dataset/offline. [OSM Tile Usage Policy](https://operations.osmfoundation.org/policies/tiles/)

## 9. Ngoài phạm vi và việc cần đồng bộ

Ngoài phạm vi hiện tại: đặt món/giao hàng, đặt vé/khách sạn, thanh toán, quyên góp, tiền thưởng/đổi quà, tích hợp review Google, theo dõi vị trí trực tiếp của người bán, phát hiện gian lận tuyệt đối và mở rộng toàn quốc.

Các việc tiếp theo, **chưa đánh dấu hoàn thành**:

- Đồng bộ tài liệu yêu cầu, use case, ERD và Figma theo ba actor; thêm cổng chủ cơ sở và luồng xác minh quyền quản lý.
- Bổ sung Góc Địa Phương, đề xuất cập nhật điểm bán, hàng chờ duyệt và cảnh báo lịch trình có thông tin thay đổi.
- Chuẩn hóa thành phần đánh giá 5 sao, trạng thái chưa có nhận xét, báo cáo vi phạm và phản hồi của chủ cơ sở.
- Kiểm kê dữ liệu OSM cho hai khu vực; chuẩn bị mẫu ảnh có quyền sử dụng và hồ sơ khảo sát, tránh công khai dữ liệu riêng.
- Khóa phiên bản stack, chọn nhà cung cấp AI/tile, thống nhất môi trường MySQL và đối chiếu cách tổ chức MVC với giảng viên.
- Kiểm thử xuyên suốt: đề xuất gánh hàng → duyệt → tìm thấy → thêm vào lịch trình thủ công/AI → mở chỉ đường; thử thêm trường hợp đổi vị trí, dữ liệu thiếu, API AI lỗi và người dùng không đủ quyền.

README và tài liệu này không tự cập nhật file Figma hoặc tài liệu Word cũ. Khi có khác biệt, cần đối chiếu lại trước khi nộp báo cáo; không dùng ảnh prototype làm bằng chứng chức năng backend đã hoàn thành.
