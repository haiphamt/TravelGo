import { Component, ElementRef, computed, effect, inject, input, signal, untracked, viewChild } from "@angular/core";
import { NavigationStart, Router } from "@angular/router";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { Icon } from "./icon";

@Component({
  selector: "tg-photo-gallery",
  standalone: true,
  imports: [Icon],
  template: `
    <figure class="gallery">
      @if (images().length) {
        <div class="gallery-grid" [class.multiple]="images().length > 1">
          @for (image of entries().slice(0, 3); track image.key) {
            @if (failed().has(image.index)) {
              <div class="preview photo-empty" role="status">
                <tg-icon name="image" />
                <strong>Ảnh {{ image.index + 1 }} chưa tải được</strong>
                <button type="button" class="button secondary" (click)="retry(image.index)">Thử tải lại ảnh</button>
              </div>
            } @else {
              <button #preview type="button" class="preview" aria-haspopup="dialog"
                [attr.aria-label]="'Mở ảnh ' + (image.index + 1) + ' / ' + images().length + ' của ' + name()"
                (click)="openViewer(preview, image.index)">
                <img [src]="image.src" alt="" (error)="fail(image.index, image.src)" />
                @if (image.index === 2 && images().length > 3) {
                  <span class="preview-label"><tg-icon name="image" />+{{ images().length - 3 }} ảnh</span>
                } @else {
                  <span class="preview-label preview-zoom"><tg-icon name="image" />Phóng to</span>
                }
              </button>
            }
          }
        </div>
        <div class="gallery-tools">
          <span class="photo-count"><tg-icon name="image" />{{ images().length }} ảnh từ hồ sơ nguồn</span>
          <button #opener type="button" class="button secondary" aria-haspopup="dialog" (click)="openViewer(opener)"><tg-icon name="image" />Xem ảnh đầy đủ</button>
        </div>
      } @else {
        <div class="photo-empty missing"><tg-icon name="image" /><strong>Chưa có ảnh địa điểm</strong><p>Nguồn chưa có ảnh được chuẩn bị cho hồ sơ này.</p></div>
      }
      @if (credit()) { <figcaption>{{ credit() }}</figcaption> }
    </figure>

    <dialog #viewer class="photo-viewer" [attr.aria-label]="'Ảnh nguồn của ' + name()" (close)="onClosed()" (keydown)="onKeydown($event)">
      <div class="viewer-layout">
        <header class="viewer-header">
          <div><h2>{{ name() }}</h2><p>Ảnh đầy đủ từ hồ sơ nguồn</p></div>
          <button type="button" class="button secondary" autofocus (click)="closeViewer()"><tg-icon name="close" />Đóng</button>
        </header>
        <div class="viewer-image">
          @if (viewerOpen()) {
            @for (image of current(); track image.key) {
              @if (failed().has(image.index)) {
                <div class="photo-empty" role="status"><tg-icon name="image" /><strong>Ảnh {{ image.index + 1 }} chưa tải được</strong><p>Bạn có thể thử lại hoặc chuyển sang ảnh khác.</p><button type="button" class="button secondary" (click)="retry(image.index)">Thử tải lại ảnh</button></div>
              } @else {
                <img [src]="image.src" [alt]="'Ảnh đầy đủ ' + (image.index + 1) + ' từ hồ sơ nguồn của ' + name()" (error)="fail(image.index, image.src)" />
              }
            }
          }
        </div>
        <footer class="viewer-footer">
          @if (images().length > 1) {
            <div class="viewer-navigation" role="group" aria-label="Chuyển ảnh">
              <button type="button" class="button secondary" (click)="move(-1)"><tg-icon name="back" />Ảnh trước</button>
              <span class="viewer-counter" role="status" aria-live="polite">{{ index() + 1 }} / {{ images().length }}</span>
              <button type="button" class="button secondary" (click)="move(1)">Ảnh sau<tg-icon name="arrow" /></button>
            </div>
          }
          @if (credit()) { <p class="viewer-credit">{{ credit() }}</p> }
        </footer>
      </div>
    </dialog>
  `,
  styles: `
    :host { display:block; min-width:0; }
    .gallery { margin:0; min-width:0; }
    .gallery-grid { display:grid; gap:8px; }
    .preview { position:relative; display:grid; place-items:center; width:100%; min-width:0; height:260px; min-height:0; overflow:hidden; padding:0; border:0; border-radius:20px; background:#eef2f5; }
    .preview > img { display:block; width:100%; height:100%; min-height:0; object-fit:cover; }
    .preview-label { position:absolute; bottom:12px; right:12px; display:flex; align-items:center; gap:6px; padding:6px 10px; border-radius:20px; background:rgb(15 23 42 / 85%); color:#fff; font-size:12px; font-weight:650; }
    .preview-label tg-icon { width:15px; height:15px; }
    @media (hover:hover) and (pointer:fine) {
      .preview-zoom { opacity:0; transition:opacity 160ms ease; }
      .preview:is(:hover,:focus-visible) .preview-zoom { opacity:1; }
      .preview:hover img { filter:brightness(.9); }
    }
    .gallery-tools { display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; padding-top:14px; }
    .photo-count { display:inline-flex; gap:7px; align-items:center; color:#475467; font-size:12px; }
    .gallery-tools .button { font-size:12px; }
    figcaption, .viewer-credit { margin:12px 0 0; color:#475467; font-size:12px; overflow-wrap:anywhere; }
    .photo-empty { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:10px; width:100%; height:100%; min-height:180px; padding:24px; color:#475467; text-align:center; }
    .preview.photo-empty { height:260px; }
    .photo-empty > tg-icon { width:32px; height:32px; color:var(--brand-text); }
    .photo-empty strong { color:var(--text); font-size:16px; }
    .photo-empty p { margin:0; max-width:44ch; font-size:13px; }
    .missing { min-height:208px; background:#eef2f5; border-radius:20px; }
    .photo-viewer { width:min(1120px,calc(100% - 32px)); height:min(880px,calc(100dvh - 32px)); max-width:100%; max-height:calc(100dvh - 32px); margin:auto; padding:0; border:0; border-radius:14px; background:var(--surface); color:var(--text); box-shadow:0 20px 70px rgb(16 24 40 / 28%); overflow:hidden; }
    .photo-viewer::backdrop { background:rgb(16 24 40 / 72%); }
    .viewer-layout { display:grid; grid-template-rows:auto minmax(0,1fr) auto; height:100%; min-width:0; }
    .viewer-header { display:flex; justify-content:space-between; align-items:center; gap:16px; padding:18px 22px; }
    .viewer-header > div { min-width:0; }
    .viewer-header h2 { margin:0 0 3px; font-size:18px; overflow-wrap:anywhere; }
    .viewer-header p { margin:0; color:#475467; font-size:12px; }
    .viewer-header .button { flex:none; }
    .viewer-image { display:grid; place-items:center; min-width:0; min-height:0; overflow:hidden; background:#eef2f5; }
    .viewer-image > img { display:block; width:100%; height:100%; min-height:0; object-fit:contain; }
    .viewer-image .photo-empty { min-height:0; overflow:auto; }
    .viewer-footer { padding:14px 22px 18px; max-height:32dvh; overflow:auto; scrollbar-color:#c2410c #fff1e6; scrollbar-width:thin; }
    .viewer-navigation { display:flex; justify-content:center; align-items:center; gap:18px; }
    .viewer-counter { min-width:42px; text-align:center; color:#475467; font-variant-numeric:tabular-nums; }
    .viewer-credit { text-align:center; }
    .viewer-footer .viewer-credit:first-child { margin-top:0; }
    button:focus-visible { outline:3px solid var(--brand-text); outline-offset:3px; }
    @media (min-width:768px) {
      .gallery-grid { height:460px; }
      .gallery-grid.multiple { grid-template-columns:minmax(0,2fr) minmax(0,1fr); grid-template-rows:repeat(2,minmax(0,1fr)); }
      .preview, .preview.photo-empty { height:100%; min-height:0; border-radius:24px; }
      .preview:first-child { grid-row:1 / -1; border-radius:30px; }
      .multiple .preview:nth-child(2):last-child { grid-row:1 / -1; }
      .missing { min-height:232px; border-radius:30px; }
    }
    @media (max-width:767px) {
      .gallery-grid.multiple { grid-auto-flow:column; grid-auto-columns:85%; grid-template-columns:94%; overflow-x:auto; scroll-snap-type:x mandatory; }
      .gallery-grid.multiple .preview { scroll-snap-align:start; }
      .gallery-grid.multiple .preview:focus-visible { outline-offset:-4px; }
    }
    @media (max-width:600px) {
      .gallery-tools { gap:10px; }
      .gallery-tools .button { padding:9px 12px; }
      .photo-empty { padding:18px 14px; }
      .photo-viewer { width:100%; height:100dvh; max-height:100dvh; border-radius:0; }
      .viewer-header { align-items:flex-start; gap:10px; padding:14px; }
      .viewer-header h2 { font-size:16px; }
      .viewer-header .button { padding:9px 10px; font-size:12px; }
      .viewer-footer { padding:12px 14px 18px; }
      .viewer-navigation { gap:10px; }
      .viewer-navigation .button { padding:9px 10px; gap:5px; font-size:12px; }
    }
  `,
})
export class PhotoGallery {
  images = input.required<readonly string[]>();
  name = input.required<string>();
  credit = input<string | null>(null);
  index = signal(0);
  failed = signal<ReadonlySet<number>>(new Set());
  viewerOpen = signal(false);
  private attempts = signal<Record<number, number>>({});
  private generation = signal(0);
  private viewer = viewChild<ElementRef<HTMLDialogElement>>("viewer");
  private opener?: HTMLButtonElement;
  entries = computed(() => this.images().map((src, index) => ({ src, index, key: [this.generation(), index, this.attempts()[index] ?? 0].join(":") })));
  current = computed(() => this.entries().slice(this.index(), this.index() + 1));

  constructor() {
    effect(() => {
      this.images();
      this.name();
      untracked(() => this.reset());
    });
    inject(Router, { optional: true })?.events.pipe(takeUntilDestroyed()).subscribe(event => {
      if (event instanceof NavigationStart) this.reset();
    });
  }

  openViewer(opener: HTMLButtonElement, index = 0) {
    if (!this.images().length) return;
    this.opener = opener;
    this.index.set(index);
    this.viewerOpen.set(true);
    this.viewer()?.nativeElement.showModal();
  }

  closeViewer() {
    this.viewer()?.nativeElement.close();
    this.viewerOpen.set(false);
  }

  onClosed() {
    this.viewerOpen.set(false);
    if (this.opener?.isConnected) this.opener.focus();
    this.opener = undefined;
  }

  move(direction: number) {
    const count = this.images().length;
    if (count > 1) this.index.update(index => (index + direction + count) % count);
  }

  onKeydown(event: KeyboardEvent) {
    if (!this.viewer()?.nativeElement.open || this.images().length < 2) return;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      this.move(event.key === "ArrowLeft" ? -1 : 1);
    }
  }

  fail(index: number, src: string) {
    if (this.images()[index] === src) this.failed.update(failed => new Set([...failed, index]));
  }

  retry(index: number) {
    this.failed.update(failed => new Set([...failed].filter(value => value !== index)));
    this.attempts.update(attempts => ({ ...attempts, [index]: (attempts[index] ?? 0) + 1 }));
  }

  private reset() {
    this.closeViewer();
    this.index.set(0);
    this.failed.set(new Set());
    this.attempts.set({});
    this.generation.update(value => value + 1);
  }
}
