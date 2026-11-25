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
  { value: "", label: "Tổng quan", icon: "fa-chart-simple" },
  { value: "queue", label: "Hàng đợi xét duyệt", icon: "fa-layer-group" },
  { value: "new", label: "Đóng góp địa điểm", icon: "fa-location-dot" },
  { value: "update", label: "Cập nhật địa điểm", icon: "fa-pen-to-square" },
  { value: "claim", label: "Quyền quản lý", icon: "fa-shield-halved" },
  { value: "report", label: "Báo cáo đánh giá", icon: "fa-flag" },
];

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
      <ng-container [ngTemplateOutlet]="brand" />
      <span class="role-topbar-label">{{ label() }}</span>
      <ng-container [ngTemplateOutlet]="account" />
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

    <ng-template #brand>
      <a class="role-brand" [routerLink]="path()" [attr.aria-label]="'TravelGo – Trang chủ ' + label()" (click)="closeMenu()">
        <span class="role-brand-mark"><img src="images/travelgo-mark.svg" alt="" width="25" height="34" /></span>
        <span>TravelGo</span>
      </a>
    </ng-template>

    <ng-template #account>
      <a class="role-account" routerLink="/tai-khoan" aria-label="Tài khoản của bạn" title="Tài khoản của bạn" (click)="closeMenu()">
        <tg-icon name="user" />
      </a>
    </ng-template>

    <ng-template #railContent>
      <div class="role-identity">
        <ng-container [ngTemplateOutlet]="brand" />
        <div class="role-identity-links">
          <p><tg-icon [name]="role() === 'admin' ? 'shield' : 'store'" /> {{ label() }}</p>
          <ng-container [ngTemplateOutlet]="account" />
        </div>
      </div>
      <nav [attr.aria-label]="'Điều hướng ' + label()">
        @for (link of links(); track link.value) {
          <a [routerLink]="path()" [queryParams]="queryFor(link.value)" [class.current]="active() === link.value"
            [attr.aria-current]="active() === link.value ? 'page' : null" (click)="closeMenu()">
            <i class="fa-solid" [class]="link.icon" aria-hidden="true"></i><span>{{ link.label }}</span>
          </a>
        }
      </nav>
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
      return ADMIN_LINKS.find(link => link.value === type && link.value !== "queue")?.value ??
        (params?.get("view") === "queue" ? "queue" : "");
    }
    const view = params?.get("view");
    if (view === "history") return view;
    return view === "claim" || (params?.get("place") && view !== "manage") ? "claim" : "";
  });

  queryFor(value: string) {
    if (!value) return null;
    if (this.role() === "owner" || value === "queue") return { view: value };
    return { loai: value };
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
