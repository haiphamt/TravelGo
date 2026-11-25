import { Component, inject } from "@angular/core";
import { RouterLink } from "@angular/router";
import { Auth } from "./auth";
import { Icon } from "./icon";

@Component({
  standalone: true,
  imports: [RouterLink, Icon],
  template: `
    <section class="feature-status">
      <span class="status-icon" aria-hidden="true"><tg-icon name="user" /></span>
      <h1>Tài khoản của bạn</h1>
      @if (auth.user(); as user) {
        <p><strong>{{ user.name }}</strong><br />{{ user.email }}</p>
        <div class="feature-actions">
          <a class="button secondary" routerLink="/yeu-thich">Địa điểm yêu thích</a>
          <a class="button secondary" routerLink="/dong-gop">Đóng góp của tôi</a>
          <a class="button secondary" routerLink="/chu-co-so">Chủ cơ sở</a>
          @if (user.admin) {
            <a class="button secondary" routerLink="/quan-tri">Quản trị viên</a>
          }
        </div>
        <div class="feature-actions">
          <button type="button" class="button primary" [disabled]="auth.pending()" (click)="logout()">{{ auth.pending() ? 'Đang đăng xuất…' : 'Đăng xuất' }}</button>
        </div>
        @if (auth.error()) { <p role="alert">{{ auth.error() }}</p> }
      } @else if (auth.ready()) {
        <p>Đăng nhập để lưu địa điểm yêu thích, viết đánh giá và tham gia phòng cùng đi.</p>
        <div class="feature-actions">
          <button type="button" class="button primary" (click)="auth.open()">Đăng nhập</button>
          <button type="button" class="button secondary" (click)="auth.open('register')">Đăng ký</button>
        </div>
      } @else {
        <p role="status">Đang mở tài khoản…</p>
      }
    </section>
  `,
})
export class Account {
  readonly auth = inject(Auth);

  async logout() {
    if (await this.auth.logout()) location.assign("/");
  }
}
