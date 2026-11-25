import { Component } from "@angular/core";
import { RouterLink } from "@angular/router";
import { Icon } from "./icon";

@Component({
  standalone: true,
  imports: [RouterLink, Icon],
  template: `
    <section class="feature-status">
      <span class="status-icon"><tg-icon name="info" /></span>
      <h1>Nguồn dữ liệu &amp; giới hạn bản dùng thử</h1>
        <p>Danh mục này phục vụ bản dùng thử frontend tại TP. Hồ Chí Minh.</p>
        <dl class="source-list">
          <dt>Địa điểm OpenStreetMap</dt><dd>Danh mục trích từ dữ liệu OSM ngày 08/11/2026 và đã lọc các trụ sở hành chính, địa điểm có nhãn hạn chế vào. <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap contributors · ODbL</a>. Tác giả, nguồn và giấy phép ảnh nằm trong chi tiết từng địa điểm.</dd>
          <dt>Góc Địa Phương</dt><dd>50 hồ sơ tham khảo từ <a href="https://ganhmuusinh.io.vn/" target="_blank" rel="noopener noreferrer">Gánh Mưu Sinh</a>, có đối chiếu một số trường từ <a href="https://ganhmuusinh.vn/" target="_blank" rel="noopener noreferrer">ganhmuusinh.vn</a>. Ảnh đang chờ xác nhận quyền sử dụng. Thông tin hồ sơ chưa được TravelGo xác minh thực địa.</dd>
          <dt>Giờ bán và giá</dt><dd>Giờ hiển thị là thông tin nguồn ghi nhận, có thể đã thay đổi. Chưa có giá được kiểm tra trong bộ hồ sơ này. Thiếu giá không có nghĩa là miễn phí.</dd>
          <dt>Yêu thích, đánh giá, lịch trình và đóng góp</dt><dd>Yêu thích và đánh giá được lưu theo tài khoản trên máy chủ. Lịch trình, đóng góp và quyết định xét duyệt trong bản thử chỉ lưu trong trình duyệt hiện tại; không thay đổi hồ sơ trên máy chủ.</dd>
        </dl>
      <div class="feature-actions"><a class="button primary" routerLink="/kham-pha">Khám phá địa điểm<tg-icon name="arrow" /></a>
        <a class="button secondary" routerLink="/goc-dia-phuong">Góc Địa Phương</a></div>
    </section>
  `,
})
export class FeatureStatus {}
