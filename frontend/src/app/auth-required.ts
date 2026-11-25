import { afterNextRender, Component, DestroyRef, effect, ElementRef, inject, viewChild, ViewContainerRef } from "@angular/core";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { Auth } from "./auth";

@Component({
  standalone: true,
  imports: [RouterLink],
  host: { class: "didaune-ui" },
  template: `
    <div inert aria-hidden="true"><ng-container #publicBackdrop /></div>
    <dialog #accessDialog class="access-dialog" aria-labelledby="access-title" aria-describedby="access-description"
      (cancel)="cancel($event)" (click)="dismissFromBackdrop($event)">
      <span class="access-icon" aria-hidden="true"><i class="fa-solid fa-lock"></i></span>
      <h1 id="access-title">Cần đăng nhập</h1>
      <p id="access-description">{{ message }}</p>
      <div class="access-actions">
        <a class="button secondary" routerLink="/" [replaceUrl]="true">Về trang chủ</a>
        <button type="button" class="button access-login" autofocus (click)="auth.open()">Đăng nhập</button>
      </div>
    </dialog>
  `,
  styles: `
    :host { display: block; }
    .access-dialog {
      position: fixed;
      inset: 0;
      width: min(420px, calc(100% - 32px));
      max-width: none;
      max-height: calc(100% - 32px);
      margin: auto;
      padding: clamp(20px, 5vw, 30px);
      overflow: auto;
      overscroll-behavior: contain;
      border: 0;
      border-radius: 24px;
      background: var(--surface);
      color: var(--text);
      box-shadow: 0 20px 52px rgb(15 23 42 / 18%);
      text-align: center;
    }
    .access-dialog::backdrop {
      background: rgb(15 23 42 / 34%);
      backdrop-filter: blur(5px);
    }
    .access-icon {
      display: inline-grid;
      width: 46px;
      height: 46px;
      place-items: center;
      margin-bottom: 12px;
      border-radius: 14px;
      background: #edf2f7;
      color: #334155;
      font-size: 1.05rem;
    }
    h1 { margin: 0; font-size: clamp(1.4rem, 4vw, 1.75rem); line-height: 1.25; letter-spacing: -.025em; }
    p { max-width: 33ch; margin: 8px auto 20px; color: var(--muted); text-wrap: pretty; }
    .access-actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
    .access-actions .button { border-radius: 12px; min-height: 44px; }
    .access-actions .button:focus-visible { outline: 2px solid #64748b; outline-offset: 3px; }
    .access-actions .access-login { color: white; background: #172339; }
    .access-actions .access-login:hover { background: #29364a; }
  `,
})
export class AuthRequired {
  readonly auth = inject(Auth);
  readonly message: string = inject(ActivatedRoute).snapshot.data["authRequired"];
  private readonly router = inject(Router);
  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>("accessDialog");
  private readonly backdrop = viewChild("publicBackdrop", { read: ViewContainerRef });

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      void import("./home").then(({ Home }) => {
        if (!destroyRef.destroyed) this.backdrop()?.createComponent(Home).setInput("backdrop", true);
      });
    });

    effect(() => {
      const dialog = this.dialog()?.nativeElement;
      const show = !this.auth.prompt() && !this.auth.user();
      if (dialog && show !== dialog.open) {
        if (show) dialog.showModal();
        else dialog.close();
      }
    });
  }

  cancel(event: Event) {
    event.preventDefault();
    this.leave();
  }

  dismissFromBackdrop(event: MouseEvent) {
    const dialog = this.dialog()?.nativeElement;
    if (!dialog || event.target !== dialog) return;
    const { left, right, top, bottom } = dialog.getBoundingClientRect();
    if (event.clientX < left || event.clientX > right || event.clientY < top || event.clientY > bottom) this.leave();
  }

  private leave() {
    void this.router.navigateByUrl("/", { replaceUrl: true });
  }
}
