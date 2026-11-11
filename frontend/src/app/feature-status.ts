import { Component, computed, inject, signal } from "@angular/core";
import { ActivatedRoute, RouterLink } from "@angular/router";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { Icon } from "./icon";

@Component({
  standalone: true,
  imports: [RouterLink, Icon],
  template: `
    <section class="feature-status">
      <span class="status-icon"><tg-icon [name]="info().icon" /></span>
      <h1>{{ info().title }}</h1>
      @if (kind() === 'sources') {
        <p>Danh mục này phục vụ bản dùng thử frontend tại TP. Hồ Chí Minh.</p>
        <dl class="source-list">
          <dt>Địa điểm OpenStreetMap</dt><dd>Danh mục trích từ dữ liệu OSM ngày 08/11/2026 và đã lọc các trụ sở hành chính, địa điểm có nhãn hạn chế vào. <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap contributors · ODbL</a>. Tác giả, nguồn và giấy phép ảnh nằm trong chi tiết từng địa điểm. <a routerLink="/ho-so-uu-tien">Xem ảnh của các cơ sở ưu tiên</a>.</dd>
          <dt>Góc Địa Phương</dt><dd>50 hồ sơ tham khảo từ <a href="https://ganhmuusinh.io.vn/" target="_blank" rel="noopener noreferrer">Gánh Mưu Sinh</a>, có đối chiếu một số trường từ <a href="https://ganhmuusinh.vn/" target="_blank" rel="noopener noreferrer">ganhmuusinh.vn</a>. Ảnh đang chờ xác nhận quyền sử dụng. Thông tin hồ sơ chưa được TravelGo xác minh thực địa.</dd>
          <dt>Giờ bán và giá</dt><dd>Giờ hiển thị là thông tin nguồn ghi nhận, có thể đã thay đổi. Chưa có giá được kiểm tra trong bộ hồ sơ này. Thiếu giá không có nghĩa là miễn phí.</dd>
          <dt>Yêu thích, đánh giá, lịch trình và đóng góp</dt><dd>Chỉ lưu trong trình duyệt hiện tại. Quyết định xét duyệt, quyền quản lý và thay đổi hồ sơ trong bản thử cũng chỉ có hiệu lực tại đây.</dd>
        </dl>
      } @else {
        <p>{{ info().description }}</p>
        <section class="role-launcher" aria-labelledby="try-role-title">
          <h2 id="try-role-title">Thử vai trò</h2>
          <p>Mở khu vực riêng để thử các thao tác của từng vai trò trên trình duyệt này.</p>
          <div class="feature-actions">
            <a class="button secondary" routerLink="/chu-co-so"><tg-icon name="store" />Chủ cơ sở</a>
            <a class="button secondary" routerLink="/quan-tri"><tg-icon name="shield" />Quản trị viên</a>
          </div>
        </section>
      }
      <div class="feature-actions"><a class="button primary" routerLink="/kham-pha">Khám phá địa điểm<tg-icon name="arrow" /></a>
        <a class="button secondary" routerLink="/goc-dia-phuong">Góc Địa Phương</a></div>
    </section>
  `,
  styles: [`
    .role-launcher {
      margin-block: 24px;
      padding: 20px;
      border: 1px solid #e2e8f0;
      border-radius: 16px;
      background: #f8fafc;
    }
    .role-launcher h2 { margin: 0 0 6px; }
    .role-launcher p { margin: 0; }
    .role-launcher .feature-actions { margin-top: 16px; }
  `],
})
export class FeatureStatus {
  route = inject(ActivatedRoute);
  kind = signal("account");
  info = computed(() => ({
    account: { icon: "user", title: "Tài khoản của bạn", description: "Hiện bạn đang dùng bản thử trên thiết bị này. Yêu thích, đánh giá thử và lịch trình được lưu cục bộ; tài khoản và đăng nhập thật sẽ được nối với backend của nhóm." },
    sources: { icon: "info", title: "Nguồn dữ liệu & giới hạn bản dùng thử", description: "" },
  } as Record<string, { icon: string; title: string; description: string }>)[this.kind()] ?? { icon: "info", title: "TravelGo", description: "Khu vực này đang được chuẩn bị." });
  constructor() { this.route.data.pipe(takeUntilDestroyed()).subscribe(data => this.kind.set(data["kind"] ?? "account")); }
}
