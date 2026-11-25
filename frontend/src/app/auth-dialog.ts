import { Component, ElementRef, input, output, signal, viewChild } from "@angular/core";
import { Icon } from "./icon";

export type AuthMode = "login" | "register";

export type AuthSubmission =
  | { mode: "login"; email: string; password: string }
  | { mode: "register"; name: string; email: string; password: string; password_confirmation: string };

@Component({
  selector: "app-auth-dialog",
  standalone: true,
  imports: [Icon],
  templateUrl: "./auth-dialog.html",
  styleUrl: "./auth-dialog.css",
})
export class AuthDialog {
  readonly pending = input(false);
  readonly error = input("");
  readonly googleEnabled = input(false);

  readonly submitted = output<AuthSubmission>();
  readonly googleRequested = output<void>();
  readonly modeChanged = output<AuthMode>();
  readonly dismissed = output<void>();

  readonly mode = signal<AuthMode>("login");
  readonly localError = signal("");
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>("dialog");
  private readonly form = viewChild.required<ElementRef<HTMLFormElement>>("form");
  private readonly password = viewChild.required<ElementRef<HTMLInputElement>>("password");

  open(mode: AuthMode = "login") {
    const element = this.dialog().nativeElement;
    if (element.open) {
      this.switchMode(mode);
      return;
    }
    this.form().nativeElement.reset();
    this.localError.set("");
    this.mode.set(mode);
    element.showModal();
    element.scrollTop = 0;
  }

  close() {
    this.dialog().nativeElement.close();
  }

  requestClose() {
    if (!this.pending()) this.close();
  }

  onCancel(event: Event) {
    if (this.pending()) event.preventDefault();
  }

  onClose() {
    this.form().nativeElement.reset();
    this.localError.set("");
    this.dismissed.emit();
  }

  switchMode(mode: AuthMode) {
    if (this.pending() || this.mode() === mode) return;
    this.password().nativeElement.value = "";
    this.localError.set("");
    this.mode.set(mode);
    this.modeChanged.emit(mode);
  }

  submit(event: Event) {
    event.preventDefault();
    if (this.pending()) return;

    const fields = new FormData(this.form().nativeElement);
    const email = String(fields.get("email") ?? "").trim();
    const password = String(fields.get("password") ?? "");
    this.localError.set("");
    if (new TextEncoder().encode(password).length > 72) {
      this.localError.set("Mật khẩu quá dài. Hãy nhập mật khẩu tối đa 72 byte.");
      return;
    }

    if (this.mode() === "login") {
      this.submitted.emit({ mode: "login", email, password });
      return;
    }

    const name = String(fields.get("name") ?? "").trim();
    const confirmation = String(fields.get("password_confirmation") ?? "");
    if (!name) {
      this.localError.set("Vui lòng nhập họ và tên.");
      return;
    }
    if (password !== confirmation) {
      this.localError.set("Mật khẩu xác nhận chưa khớp.");
      return;
    }
    this.submitted.emit({ mode: "register", name, email, password, password_confirmation: confirmation });
  }
}
