import { Component, ElementRef, effect, inject, signal, untracked, viewChild } from "@angular/core";
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from "@angular/router";
import { FormsModule } from "@angular/forms";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { TravelStore } from "./store";
import { Icon } from "./icon";
import { WorkspaceNavigation, type WorkspaceRole } from "./workspace-navigation";
import { Auth } from "./auth";
import { AuthDialog, type AuthSubmission } from "./auth-dialog";
import { accountInitials } from "./account-initials";

// Didaune shared/ui/header and shared/ui/aside at 04597f6, with TravelGo routes and catalog.
@Component({
  selector: "app-root",
  standalone: true,
  imports: [RouterLink, RouterLinkActive, RouterOutlet, FormsModule, Icon, WorkspaceNavigation, AuthDialog],
  host: {
    "(document:keydown.escape)": "closeMenu(true); closeAccountMenu(true); closeMobileSearch(true)",
    "(document:click)": "closeHeaderOutside($event.target)",
  },
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
      <button #mobileSearchButton type="button" class="header-mobile-action mobile-search-button" aria-label="Mở tìm kiếm"
        aria-controls="header-filters" [attr.aria-expanded]="mobileSearchOpen()" (click)="toggleMobileSearch()">
        <tg-icon [name]="mobileSearchOpen() ? 'close' : 'search'" />
      </button>
      <a class="header-mobile-action" routerLink="/ban-do" [queryParams]="{ 'dinh-vi': '1' }" aria-label="Tìm gần vị trí của bạn">
        <i class="fa-solid fa-location-crosshairs" aria-hidden="true"></i>
      </a>
      <div id="header-filters" #headerFilters class="header-filters" [class.expanded]="mobileSearchOpen()">
        <form class="global-search relative flex items-center rounded-xl bg-slate-100" role="search" (ngSubmit)="search()">
          <i class="fa-solid fa-magnifying-glass text-slate-500" aria-hidden="true"></i>
          <input #globalSearchInput class="w-full text-slate-700" aria-label="Tìm địa điểm hoặc món ăn tại TP.HCM" placeholder="Tìm kiếm địa điểm"
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
      </div>
      @if (auth.user(); as user) {
        <div class="header-account" #accountControl (focusout)="closeAccountOutside($event.relatedTarget)">
          <button #accountButton type="button" class="avatar account-initials" aria-label="Menu tài khoản"
            aria-controls="account-dropdown" [attr.aria-expanded]="accountMenuOpen()" (click)="toggleAccountMenu()">
            <span aria-hidden="true">{{ accountInitials(user.name) }}</span>
          </button>
          <nav id="account-dropdown" class="account-dropdown" aria-label="Tùy chọn tài khoản" [hidden]="!accountMenuOpen()">
            <p class="account-dropdown-name">{{ user.name }}</p>
            <a routerLink="/tai-khoan" routerLinkActive="account-dropdown-current" ariaCurrentWhenActive="page" (click)="closeAccountMenu(true)">
              <tg-icon name="user" /> Tài khoản của bạn
            </a>
            @if (user.admin) {
              <a routerLink="/quan-tri" (click)="closeAccountMenu(true)"><tg-icon name="shield" /> Quản trị</a>
            }
            <a routerLink="/chu-co-so" (click)="closeAccountMenu(true)"><tg-icon name="store" /> Chủ cơ sở</a>
            <div class="account-dropdown-session">
              <button type="button" [disabled]="auth.pending()" (click)="signOut(true)"><tg-icon name="users" /> Đổi tài khoản</button>
              <button type="button" [disabled]="auth.pending()" (click)="signOut()"><tg-icon name="logout" /> Đăng xuất</button>
            </div>
          </nav>
        </div>
      } @else {
        <button type="button" class="avatar account-initials" aria-label="Đăng nhập" (click)="closeMobileSearch(); auth.open()"><span aria-hidden="true">KH</span></button>
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
    <nav class="mobile-bottom-nav" aria-label="Điều hướng trên điện thoại">
      @for (link of mobileLinks; track link.path) {
        <a [routerLink]="link.path" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: link.path === '/' }" ariaCurrentWhenActive="page">
          <i class="fa-solid" [class]="link.icon" aria-hidden="true"></i><span>{{ link.label }}</span>
        </a>
      }
    </nav>
    }
    <main id="main-content" tabindex="-1" [class.workspace-main]="workspace()" [class.public-main]="!workspace()">
      @if (store.storageWarning()) { <div class="message error" role="alert">{{ store.storageWarning() }}</div> }
      <router-outlet />
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
  readonly accountInitials = accountInitials;
  readonly auth = inject(Auth);
  store = inject(TravelStore);
  router = inject(Router);
  menuOpen = signal(false);
  readonly accountMenuOpen = signal(false);
  readonly mobileSearchOpen = signal(false);
  workspace = signal<WorkspaceRole | null>(null);
  searchText = signal("");
  areaText = signal("");
  private activePath = "";
  menuButton = viewChild<ElementRef<HTMLButtonElement>>("menuButton");
  private readonly accountControl = viewChild<ElementRef<HTMLDivElement>>("accountControl");
  private readonly accountButton = viewChild<ElementRef<HTMLButtonElement>>("accountButton");
  private readonly mobileSearchButton = viewChild<ElementRef<HTMLButtonElement>>("mobileSearchButton");
  private readonly headerFilters = viewChild<ElementRef<HTMLDivElement>>("headerFilters");
  private readonly globalSearchInput = viewChild<ElementRef<HTMLInputElement>>("globalSearchInput");
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
  readonly mobileLinks = [
    { path: "/", label: "Trang chủ", icon: "fa-house" },
    { path: "/kham-pha", label: "Khám phá", icon: "fa-compass" },
    { path: "/yeu-thich", label: "Đã lưu", icon: "fa-heart" },
    { path: "/ban-do", label: "Bản đồ", icon: "fa-map-location-dot" },
    { path: "/tai-khoan", label: "Hồ sơ", icon: "fa-user" },
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
        this.closeAccountMenu();
        this.closeMobileSearch();
        const route = this.router.routerState.snapshot.root.firstChild;
        const role = route?.data["workspace"];
        this.workspace.set(role === "owner" || role === "admin" ? role : null);
        if (route?.routeConfig?.path && route.routeConfig.path !== "tai-khoan" && !route.data["authRequired"]) {
          this.store.ensureCatalog();
        }
        const query = this.router.parseUrl(event.urlAfterRedirects).queryParamMap;
        if (query.get("auth_error") === "google") {
          this.auth.open();
          this.auth.error.set("Chưa đăng nhập được bằng Google. Hãy thử lại hoặc dùng email.");
          void this.router.navigate([], { queryParams: { auth_error: null }, queryParamsHandling: "merge", replaceUrl: true });
        }
        if (route?.routeConfig?.path === "tai-khoan" && query.get("dang-nhap") === "1") {
          this.auth.open();
          void this.router.navigate([], { queryParams: { "dang-nhap": null }, queryParamsHandling: "merge", replaceUrl: true });
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
    const activeRoute = this.router.routerState.snapshot.root.firstChild;
    if (activeRoute?.data["authRequired"]) {
      void this.router.navigateByUrl(this.router.url, { onSameUrlNavigation: "reload" }).then(restored => {
        if (restored) document.getElementById("main-content")?.focus({ preventScroll: true });
      });
    } else if (this.auth.user()?.admin) {
      void this.router.navigateByUrl("/quan-tri");
    }
  }
  signInWithGoogle() {
    if (!this.auth.googleEnabled() || this.auth.pending()) return;
    const returnTo = location.pathname + location.search + location.hash;
    location.assign(`/api/auth/google?${new URLSearchParams({ return_to: returnTo })}`);
  }
  search() {
    const q = this.searchText().trim();
    const area = this.areaText().trim();
    this.closeMobileSearch(true);
    void this.router.navigate(["/kham-pha"], { queryParams: { q: q || null, area: area || null } });
  }
  toggleMenu() {
    this.closeAccountMenu();
    this.closeMobileSearch();
    this.menuOpen.update(value => !value);
    if (this.menuOpen()) queueMicrotask(() => document.querySelector<HTMLAnchorElement>("#main-navigation nav a")?.focus());
  }
  closeMenu(restoreFocus = false) {
    const wasOpen = this.menuOpen();
    this.menuOpen.set(false);
    if (wasOpen && restoreFocus) this.menuButton()?.nativeElement.focus();
  }

  toggleAccountMenu() {
    this.closeMenu();
    this.closeMobileSearch();
    this.accountMenuOpen.update(open => !open);
  }

  closeAccountMenu(restoreFocus = false) {
    if (!this.accountMenuOpen()) return;
    this.accountMenuOpen.set(false);
    if (restoreFocus) this.accountButton()?.nativeElement.focus();
  }

  closeAccountOutside(target: EventTarget | null) {
    if (target instanceof Node && this.accountControl()?.nativeElement.contains(target)) return;
    this.closeAccountMenu();
  }

  closeHeaderOutside(target: EventTarget | null) {
    this.closeAccountOutside(target);
    if (target instanceof Node && (this.headerFilters()?.nativeElement.contains(target) ||
      this.mobileSearchButton()?.nativeElement.contains(target))) return;
    this.closeMobileSearch();
  }

  toggleMobileSearch() {
    this.closeMenu();
    this.closeAccountMenu();
    this.mobileSearchOpen.update(open => !open);
    if (this.mobileSearchOpen()) {
      requestAnimationFrame(() => {
        if (this.mobileSearchOpen()) this.globalSearchInput()?.nativeElement.focus();
      });
    }
  }

  closeMobileSearch(restoreFocus = false) {
    if (!this.mobileSearchOpen()) return;
    this.mobileSearchOpen.set(false);
    if (restoreFocus) this.mobileSearchButton()?.nativeElement.focus();
  }

  async signOut(switchAccount = false) {
    if (this.auth.pending()) return;
    if (await this.auth.logout()) {
      location.assign(switchAccount ? "/tai-khoan?dang-nhap=1" : "/");
    } else {
      this.store.toast(this.auth.error());
    }
  }
}
