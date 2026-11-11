import { Component, ElementRef, inject, signal, viewChild } from "@angular/core";
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from "@angular/router";
import { FormsModule } from "@angular/forms";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { TravelStore } from "./store";
import { Icon } from "./icon";
import { WorkspaceNavigation, type WorkspaceRole } from "./workspace-navigation";

// Didaune shared/ui/header and shared/ui/aside at 04597f6, with TravelGo routes and catalog.
@Component({
  selector: "app-root",
  standalone: true,
  imports: [RouterLink, RouterLinkActive, RouterOutlet, FormsModule, Icon, WorkspaceNavigation],
  host: { "(document:keydown.escape)": "closeMenu(true)" },
  template: `
    <a class="skip-link" href="#main-content">Đến nội dung chính</a>
    @if (workspace(); as role) {
      @defer (on immediate) {
        <tg-workspace-navigation [role]="role" />
      }
    } @else {
    <header class="topbar didaune-ui">
      <button #menuButton class="icon-button mobile-menu" aria-label="Mở menu"
        aria-controls="main-navigation" [attr.aria-expanded]="menuOpen()" (click)="toggleMenu()">
        <i class="fa-solid" [class.fa-xmark]="menuOpen()" [class.fa-bars]="!menuOpen()" aria-hidden="true"></i>
      </button>
      <a routerLink="/" class="brand" aria-label="TravelGo — Trang chủ">
        <tg-icon name="pin" /><span>Travel<span>Go</span></span><i></i>
      </a>
      <form class="global-search relative flex items-center rounded-xl bg-slate-100" role="search" (ngSubmit)="search()">
        <i class="fa-solid fa-magnifying-glass text-slate-500" aria-hidden="true"></i>
        <input class="w-full text-slate-700" aria-label="Tìm địa điểm hoặc món ăn tại TP.HCM" placeholder="Tìm kiếm địa điểm"
          [ngModel]="searchText()" (ngModelChange)="searchText.set($event)" name="search" />
        @if (searchText()) {
          <button type="button" class="icon-button" aria-label="Xóa từ khóa" (click)="searchText.set('')"><tg-icon name="close" /></button>
        }
        <button type="submit" class="icon-button" aria-label="Tìm kiếm"><tg-icon name="arrow" /></button>
      </form>
      <a class="header-map-link hidden h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-600 hover:border-primary_light hover:bg-orange-50 lg:flex" routerLink="/ban-do" aria-label="Mở bản đồ TP.HCM">
        <i class="fa-solid fa-location-crosshairs" aria-hidden="true"></i>
      </a>
      <div class="city-control fixed-city rounded-lg border border-slate-200 bg-slate-50 text-slate-700" aria-label="Khu vực triển khai: Thành phố Hồ Chí Minh">
        <span class="lg:hidden">TP. Hồ Chí Minh</span>
        <select class="hidden lg:block" aria-label="Thành phố triển khai">
          <option>Thành phố Hồ Chí Minh</option>
        </select>
      </div>
      <form class="header-area hidden xl:flex" role="search" (ngSubmit)="search()" aria-label="Tìm phường hoặc xã">
        <input type="search" aria-label="Lọc theo phường hoặc xã trong địa chỉ nguồn" placeholder="Tìm Phường/ Xã" maxlength="120"
          name="area" [ngModel]="areaText()" (ngModelChange)="areaText.set($event)" />
        <button type="submit" aria-label="Áp dụng tìm phường hoặc xã"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i></button>
      </form>
      <a class="avatar" routerLink="/tai-khoan" aria-label="Thông tin tài khoản bản dùng thử"><tg-icon name="user" /></a>
    </header>
    @if (menuOpen()) { <button class="menu-backdrop" aria-label="Đóng menu" (click)="closeMenu(true)"></button> }
    <aside id="main-navigation" class="sidebar didaune-ui" [class.open]="menuOpen()">
      <nav class="mb-8 flex flex-col gap-1" aria-label="Điều hướng chính">
        @for (link of links; track link.path) {
          <a [routerLink]="link.path" routerLinkActive="active bg-primary_light text-primary"
            [routerLinkActiveOptions]="{ exact: link.path === '/' }" ariaCurrentWhenActive="page">
            <i class="fa-solid w-5 text-center text-base" [class]="link.icon" aria-hidden="true"></i><span>{{ link.label }}</span>
            @if (link.path === '/lich-trinh' && store.state().trip.length) { <span class="nav-count">{{ store.state().trip.length }}</span> }
          </a>
        }
      </nav>
      <div class="sidebar-footer">
        <span class="preview-dot"></span><strong>Bản dùng thử frontend</strong>
        <p>Yêu thích, lịch trình, đánh giá và đóng góp thử chỉ lưu trên trình duyệt này.</p>
        <a routerLink="/tai-khoan">Thử vai trò <tg-icon name="arrow" /></a>
        <a routerLink="/nguon-du-lieu">Nguồn dữ liệu &amp; giới hạn <tg-icon name="external" /></a>
      </div>
    </aside>
    }
    <main id="main-content" tabindex="-1" [class.workspace-main]="workspace()">
      @if (store.storageWarning()) { <div class="message error" role="alert">{{ store.storageWarning() }}</div> }
      <router-outlet />
      <footer class="page-footer">
        <span>TravelGo · {{ workspace() ? 'Bản dùng thử' : 'Khám phá theo cách của bạn' }}</span><span>TP. Hồ Chí Minh</span>
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap contributors · ODbL</a>
      </footer>
    </main>
    @if (store.notice()) {
      <div class="toast" role="status"><tg-icon name="info" /><span>{{ store.notice() }}</span>
        <button class="icon-button" aria-label="Đóng thông báo" (click)="store.notice.set('')"><tg-icon name="close" /></button>
      </div>
    }
  `,
})
export class App {
  store = inject(TravelStore);
  router = inject(Router);
  menuOpen = signal(false);
  workspace = signal<WorkspaceRole | null>(null);
  searchText = signal("");
  areaText = signal("");
  private activePath = "";
  menuButton = viewChild<ElementRef<HTMLButtonElement>>("menuButton");
  links = [
    { path: "/", label: "Trang chủ", icon: "fa-house" },
    { path: "/kham-pha", label: "Khám phá", icon: "fa-compass" },
    { path: "/goc-dia-phuong", label: "Góc Địa Phương", icon: "fa-store" },
    { path: "/yeu-thich", label: "Yêu thích", icon: "fa-heart" },
    { path: "/lich-trinh", label: "Tạo lịch trình", icon: "fa-location-dot" },
    { path: "/ban-do", label: "Bản đồ", icon: "fa-map-location-dot" },
    { path: "/phong-cung-di", label: "Phòng cùng đi", icon: "fa-box" },
    { path: "/dong-gop", label: "Đóng góp của tôi", icon: "fa-plus" },
  ];
  constructor() {
    this.router.events.pipe(takeUntilDestroyed()).subscribe(event => {
      if (event instanceof NavigationEnd) {
        this.closeMenu();
        const role = this.router.routerState.snapshot.root.firstChild?.data["workspace"];
        this.workspace.set(role === "owner" || role === "admin" ? role : null);
        const query = this.router.parseUrl(event.urlAfterRedirects).queryParamMap;
        this.searchText.set(query.get("q") ?? "");
        this.areaText.set(query.get("area") ?? "");
        const path = event.urlAfterRedirects.split(/[?#]/, 1)[0];
        if (path !== this.activePath) document.getElementById("main-content")?.focus({ preventScroll: true });
        this.activePath = path;
      }
    });
  }
  search() {
    const q = this.searchText().trim();
    const area = this.areaText().trim();
    void this.router.navigate(["/kham-pha"], { queryParams: { q: q || null, area: area || null } });
  }
  toggleMenu() {
    this.menuOpen.update(value => !value);
    if (this.menuOpen()) queueMicrotask(() => document.querySelector<HTMLAnchorElement>("#main-navigation nav a")?.focus());
  }
  closeMenu(restoreFocus = false) {
    const wasOpen = this.menuOpen();
    this.menuOpen.set(false);
    if (wasOpen && restoreFocus) this.menuButton()?.nativeElement.focus();
  }
}
