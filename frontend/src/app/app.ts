import { Component, ElementRef, effect, inject, signal, untracked, viewChild } from "@angular/core";
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from "@angular/router";
import { FormsModule } from "@angular/forms";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { TravelStore } from "./store";
import { Icon } from "./icon";
import { WorkspaceNavigation, type WorkspaceRole } from "./workspace-navigation";
import { Auth } from "./auth";
import { AuthDialog, type AuthSubmission } from "./auth-dialog";

// Didaune shared/ui/header and shared/ui/aside at 04597f6, with TravelGo routes and catalog.
@Component({
  selector: "app-root",
  standalone: true,
  imports: [RouterLink, RouterLinkActive, RouterOutlet, FormsModule, Icon, WorkspaceNavigation, AuthDialog],
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
        <img class="brand-mark" src="images/travelgo-mark.svg" alt="" width="25" height="34" />
        <span>TravelGo</span>
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
      @if (auth.user(); as user) {
        <a class="avatar" routerLink="/tai-khoan" aria-label="Tài khoản của bạn" [title]="user.name">{{ user.name.trim().slice(0, 1).toUpperCase() }}</a>
      } @else {
        <button type="button" class="avatar" aria-label="Đăng nhập" (click)="auth.open()"><tg-icon name="user" /></button>
      }
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
    <app-auth-dialog #authDialog [pending]="auth.pending()" [error]="auth.error()"
      [googleEnabled]="auth.googleEnabled()" (submitted)="submitAuth($event)"
      (googleRequested)="signInWithGoogle()" (modeChanged)="auth.error.set('')"
      (dismissed)="auth.prompt.set(null)" />
    @if (store.notice()) {
      <div class="toast" role="status"><tg-icon name="info" /><span>{{ store.notice() }}</span>
        <button class="icon-button" aria-label="Đóng thông báo" (click)="store.notice.set('')"><tg-icon name="close" /></button>
      </div>
    }
  `,
})
export class App {
  readonly auth = inject(Auth);
  store = inject(TravelStore);
  router = inject(Router);
  menuOpen = signal(false);
  workspace = signal<WorkspaceRole | null>(null);
  searchText = signal("");
  areaText = signal("");
  private activePath = "";
  menuButton = viewChild<ElementRef<HTMLButtonElement>>("menuButton");
  private readonly authDialog = viewChild<AuthDialog>("authDialog");
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
    effect(() => {
      const prompt = this.auth.prompt();
      const dialog = this.authDialog();
      if (prompt && dialog) untracked(() => dialog.open(prompt.mode));
    });
    this.router.events.pipe(takeUntilDestroyed()).subscribe(event => {
      if (event instanceof NavigationEnd) {
        this.closeMenu();
        const route = this.router.routerState.snapshot.root.firstChild;
        const role = route?.data["workspace"];
        this.workspace.set(role === "owner" || role === "admin" ? role : null);
        if (route?.routeConfig?.path !== "") this.store.ensureCatalog();
        const query = this.router.parseUrl(event.urlAfterRedirects).queryParamMap;
        if (query.get("auth_error") === "google") {
          this.auth.open();
          this.auth.error.set("Chưa đăng nhập được bằng Google. Hãy thử lại hoặc dùng email.");
          void this.router.navigate([], { queryParams: { auth_error: null }, queryParamsHandling: "merge", replaceUrl: true });
        }
        this.searchText.set(query.get("q") ?? "");
        this.areaText.set(query.get("area") ?? "");
        const path = event.urlAfterRedirects.split(/[?#]/, 1)[0];
        if (path !== this.activePath) document.getElementById("main-content")?.focus({ preventScroll: true });
        this.activePath = path;
      }
    });
  }
  async submitAuth(details: AuthSubmission) {
    if (!await this.auth.submit(details)) return;
    this.authDialog()?.close();
    this.auth.prompt.set(null);
    void this.store.refreshAccount();
    void this.store.refreshItineraries();
    this.store.toast(details.mode === "register" ? "Đã tạo tài khoản TravelGo." : "Đã đăng nhập TravelGo.");
  }
  signInWithGoogle() {
    if (!this.auth.googleEnabled() || this.auth.pending()) return;
    const returnTo = location.pathname + location.search + location.hash;
    location.assign(`/api/auth/google?${new URLSearchParams({ return_to: returnTo })}`);
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
