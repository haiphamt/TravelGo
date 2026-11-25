import { afterNextRender, Component, ElementRef, inject, Injector, signal, viewChild } from "@angular/core";
import { RouterLink } from "@angular/router";
import { Auth } from "./auth";
import { Icon } from "./icon";
import { TravelStore } from "./store";

@Component({
  standalone: true,
  imports: [RouterLink, Icon],
  templateUrl: "./account.html",
  styleUrl: "./account.css",
})
export class Account {
  readonly auth = inject(Auth);
  readonly store = inject(TravelStore);
  readonly editing = signal(false);
  readonly saving = signal(false);
  readonly profileError = signal("");
  readonly saved = signal(false);
  readonly activityLinks = [
    { path: "/yeu-thich", icon: "heart", label: "Địa điểm yêu thích", detail: "Xem lại những nơi bạn đã lưu" },
    { path: "/lich-trinh", icon: "calendar", label: "Lịch trình của bạn", detail: "Mở và chỉnh sửa lịch trình đã lưu" },
    { path: "/phong-cung-di", icon: "users", label: "Phòng cùng đi", detail: "Lên kế hoạch và bình chọn cùng bạn bè" },
    { path: "/dong-gop", icon: "plus", label: "Đóng góp của tôi", detail: "Theo dõi các đề xuất đã gửi" },
  ];

  private readonly injector = inject(Injector);
  private readonly nameInput = viewChild<ElementRef<HTMLInputElement>>("nameInput");
  private readonly editButton = viewChild<ElementRef<HTMLButtonElement>>("editButton");

  editProfile(editing: boolean) {
    this.editing.set(editing);
    this.profileError.set("");
    if (editing) this.saved.set(false);
    afterNextRender(() => (editing ? this.nameInput() : this.editButton())?.nativeElement.focus(), {
      injector: this.injector,
    });
  }

  async saveName(rawName: string, accountId: string) {
    if (this.auth.pending()) return;
    const name = rawName.trim();
    if (!name) {
      this.profileError.set("Hãy nhập họ và tên.");
      this.nameInput()?.nativeElement.focus();
      return;
    }

    this.profileError.set("");
    this.saving.set(true);
    const saved = await this.auth.updateProfile(name, accountId);
    this.saving.set(false);
    if (saved) {
      this.saved.set(true);
      this.editProfile(false);
    } else {
      this.profileError.set(this.auth.error());
    }
  }
}
