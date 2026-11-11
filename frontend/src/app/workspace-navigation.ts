import { Component, ElementRef, computed, inject, input, signal, viewChild } from "@angular/core";
import { NgTemplateOutlet } from "@angular/common";
import { toSignal } from "@angular/core/rxjs-interop";
import { ActivatedRoute, RouterLink } from "@angular/router";
import { Icon } from "./icon";

export type WorkspaceRole = "owner" | "admin";

const OWNER_LINKS = [
  { value: "", label: "Địa điểm quản lý", icon: "fa-store" },
  { value: "claim", label: "Xin quyền quản lý", icon: "fa-clipboard-check" },
  { value: "history", label: "Lịch sử yêu cầu", icon: "fa-clock-rotate-left" },
];

const ADMIN_LINKS = [
  { value: "", label: "Hàng đợi xét duyệt", icon: "fa-layer-group" },
  { value: "new", label: "Đóng góp địa điểm", icon: "fa-location-dot" },
  { value: "update", label: "Cập nhật địa điểm", icon: "fa-pen-to-square" },
  { value: "claim", label: "Quyền quản lý", icon: "fa-shield-halved" },
  { value: "report", label: "Báo cáo đánh giá", icon: "fa-flag" },
];

// The admin rail follows Didaune's admin shell. The owner rail uses its public shell palette.
@Component({
  selector: "tg-workspace-navigation",
  standalone: true,
  imports: [RouterLink, Icon, NgTemplateOutlet],
  host: {
    "[class.admin-navigation]": "role() === 'admin'",
    "(window:resize)": "closeDesktopMenu()",
  },
  styleUrl: "./workspace-navigation.css",
  template: `
    <header class="role-topbar">
      <button class="role-menu-button" type="button" aria-controls="role-mobile-rail" aria-label="Mở menu khu vực"
        [attr.aria-expanded]="open()" (click)="openMenu()"><tg-icon name="menu" /></button>
      <span class="role-topbar-brand">TravelGo<span>.</span></span>
      <span class="role-topbar-label">{{ label() }}</span>
    </header>

    <aside class="role-rail role-desktop" [attr.aria-label]="label()">
      <ng-container [ngTemplateOutlet]="railContent" />
    </aside>
    <dialog #mobileRail id="role-mobile-rail" class="role-mobile" [attr.aria-label]="'Menu ' + label()"
      (click)="$event.target === mobileRail && closeMenu()" (close)="open.set(false)">
      <div class="role-rail">
        <button class="role-menu-button role-menu-close" type="button" aria-label="Đóng menu khu vực"
          autofocus (click)="closeMenu()"><tg-icon name="close" /></button>
        <ng-container [ngTemplateOutlet]="railContent" />
      </div>
    </dialog>

    <ng-template #railContent>
      <div class="role-identity">
        <a class="role-brand" routerLink="/" (click)="closeMenu()"><tg-icon name="pin" /> <span>TravelGo<span class="role-brand-dot">.</span></span></a>
        <p><tg-icon [name]="role() === 'admin' ? 'shield' : 'store'" /> {{ label() }}</p>
      </div>
      <nav [attr.aria-label]="'Điều hướng ' + label()">
        @for (link of links(); track link.value) {
          <a [routerLink]="path()" [queryParams]="queryFor(link.value)" [class.current]="active() === link.value"
            [attr.aria-current]="active() === link.value ? 'page' : null" (click)="closeMenu()">
            <i class="fa-solid" [class]="link.icon" aria-hidden="true"></i><span>{{ link.label }}</span>
          </a>
        }
      </nav>
      <div class="role-bottom">
        <p>Bản dùng thử trên trình duyệt này</p>
        <a routerLink="/" (click)="closeMenu()"><tg-icon name="back" /> Về trang Người dùng</a>
      </div>
    </ng-template>
  `,
})
export class WorkspaceNavigation {
  readonly role = input.required<WorkspaceRole>();
  readonly open = signal(false);
  private readonly params = toSignal(inject(ActivatedRoute).queryParamMap);
  private readonly mobileRail = viewChild.required<ElementRef<HTMLDialogElement>>("mobileRail");
  readonly label = computed(() => this.role() === "admin" ? "Quản trị viên" : "Chủ cơ sở");
  readonly path = computed(() => this.role() === "admin" ? "/quan-tri" : "/chu-co-so");
  readonly links = computed(() => this.role() === "admin" ? ADMIN_LINKS : OWNER_LINKS);
  readonly active = computed(() => {
    const params = this.params();
    if (this.role() === "admin") {
      const type = params?.get("loai");
      return ADMIN_LINKS.find(link => link.value === type)?.value ?? "";
    }
    const view = params?.get("view");
    if (view === "history") return view;
    return view === "claim" || (params?.get("place") && view !== "manage") ? "claim" : "";
  });

  queryFor(value: string) {
    if (!value) return null;
    return this.role() === "admin" ? { loai: value } : { view: value };
  }

  openMenu() {
    this.mobileRail().nativeElement.showModal();
    this.open.set(true);
  }

  closeMenu() {
    if (this.open()) this.mobileRail().nativeElement.close();
  }

  closeDesktopMenu() {
    if (window.innerWidth > 900) this.closeMenu();
  }
}
