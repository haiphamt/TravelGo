import { DatePipe } from "@angular/common";
import { Component, DestroyRef, ElementRef, Injector, afterNextRender, computed, effect, inject, input, output, signal, viewChild } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { RouterLink } from "@angular/router";
import { CATEGORIES, Place } from "./data";
import { Icon } from "./icon";
import { normalize, validatePhoto } from "./logic";
import { TravelStore } from "./store";
import { ChangeKind, PlacePatch, RequestKind, WorkflowDraft, WorkflowRequest, placeRevision, workflowLabels } from "./workflow";
import { WorkflowStore } from "./workflow-store";

@Component({
  selector: "tg-workflow-place-picker",
  standalone: true,
  imports: [FormsModule, Icon, RouterLink],
  template: `
    <label class="workflow-search">
      <span>Tìm địa điểm trong danh mục</span>
      <input #searchField type="search" maxlength="120" placeholder="Tên, món chính hoặc địa chỉ"
        [ngModel]="query()" (ngModelChange)="query.set($event)" />
    </label>
    @if (store.catalogStatus() === 'loading') {
      <p class="muted" role="status">Đang tải danh mục địa điểm…</p>
    } @else if (store.catalogStatus() === 'error') {
      <p class="message error" role="alert">{{ store.catalogError() }}</p>
      <button type="button" class="button secondary" (click)="store.loadCatalog()">Tải lại danh mục</button>
    } @else if (query().trim()) {
      @if (matches().length) {
        <ul class="workflow-results" aria-label="Kết quả tìm địa điểm">
          @for (place of matches(); track place.id) {
            <li><button type="button" class="workflow-choice" (click)="select(place.id, $event)">
              <tg-icon name="pin" /><span><strong>{{ place.name }}</strong><small>{{ place.area }}</small></span>
            </button></li>
          }
        </ul>
        @if (matches().length === 8) { <p class="muted small">Thêm từ khóa để thu hẹp 8 kết quả hiển thị.</p> }
      } @else {
        <p class="muted" role="status">Chưa tìm thấy địa điểm phù hợp.</p>
      }
    }
    @if (selected(); as place) {
      <p class="workflow-note"><tg-icon name="pin" />
        <span>Đã chọn <a [routerLink]="['/dia-diem', place.id]">{{ place.name }}</a> · {{ place.area }}</span>
      </p>
    }
  `,
})
export class WorkflowPlacePicker {
  readonly store = inject(TravelStore);
  readonly selectedId = input("");
  readonly selectedIdChange = output<string>();
  readonly query = signal("");
  private readonly searchField = viewChild<ElementRef<HTMLInputElement>>("searchField");
  readonly selected = computed(() => this.store.places().find(place => place.id === this.selectedId()));
  readonly matches = computed(() => {
    const words = normalize(this.query()).split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    return this.store.places().filter(place => {
      const text = normalize(`${place.name} ${place.area} ${place.products.join(" ")}`);
      return words.every(word => text.includes(word));
    }).slice(0, 8);
  });
  select(id: string, event: MouseEvent) {
    if (event.detail === 0) this.searchField()?.nativeElement.focus();
    this.query.set("");
    this.selectedIdChange.emit(id);
  }
}

@Component({
  selector: "tg-workflow-history",
  standalone: true,
  imports: [DatePipe, RouterLink],
  template: `
    <section class="workflow-panel" aria-labelledby="my-workflow-history">
      <h2 id="my-workflow-history">{{ heading() }}</h2>
      @if (!entries().length) {
        <p class="muted">{{ emptyMessage() }}</p>
      } @else {
        <ul class="workflow-list">
          @for (request of ordered(); track request.id) {
            <li class="workflow-row">
              <div class="section-heading">
                <div><h3>{{ titleFor(request) }}</h3><p class="muted small">{{ request.kind === 'update' && request.change ? labels.change[request.change] : labels.kind[request.kind] }} · {{ request.createdAt | date:'dd/MM/yyyy HH:mm':'+0700' }}</p></div>
                <span class="workflow-status" [attr.data-status]="request.status">{{ labels.status[request.status] }}</span>
              </div>
              @if (request.history.at(-1); as event) {
                @if (event.reason && event.actor === 'admin') { <p>{{ event.reason }}</p> }
              }
              @if (request.reportAction; as outcome) { <p>{{ labels.reportAction[outcome] }}</p> }
              @if (request.status === 'approved' && request.kind === 'update' && request.effectiveFrom) {
                <p class="muted small">Hiệu lực từ {{ request.effectiveFrom | date:'dd/MM/yyyy HH:mm':'+0700' }}
                  @if (request.effectiveUntil) { đến {{ request.effectiveUntil | date:'dd/MM/yyyy HH:mm':'+0700' }} }
                </p>
              }
              <details class="workflow-history">
                <summary>Lịch sử xử lý</summary>
                <ol>
                  @for (event of request.history; track $index) {
                    <li><strong>{{ labels.status[event.status] }}</strong>
                      <span class="muted small"> · {{ labels.actor[event.actor] }} · {{ event.at | date:'dd/MM/yyyy HH:mm':'+0700' }}</span>
                      @if (event.reason) { <p>{{ event.reason }}</p> }
                    </li>
                  }
                </ol>
              </details>
              @if (request.status === 'pending' || request.status === 'needs-info' || request.status === 'approved') {
                <div class="workflow-actions">
                  @if (request.status === 'needs-info') {
                    <button type="button" class="button secondary" [disabled]="busy()" (click)="edit.emit(request)">Bổ sung và gửi lại</button>
                  }
                  @if (request.status === 'pending' || request.status === 'needs-info') {
                    <button type="button" class="text-button" [disabled]="busy()" (click)="withdraw.emit(request.id)">Rút yêu cầu</button>
                  }
                  @if (request.status === 'approved' && (request.kind === 'new' || request.kind === 'update') && exists(request.placeId)) {
                    <a class="text-button" [routerLink]="['/dia-diem', request.placeId]">Xem hồ sơ địa điểm</a>
                  }
                </div>
              }
            </li>
          }
        </ul>
      }
    </section>
  `,
})
export class WorkflowHistory {
  readonly store = inject(TravelStore);
  readonly entries = input.required<WorkflowRequest[]>();
  readonly heading = input("Đóng góp của tôi");
  readonly emptyMessage = input("Các yêu cầu bạn gửi sẽ xuất hiện ở đây.");
  readonly busy = input(false);
  readonly edit = output<WorkflowRequest>();
  readonly withdraw = output<string>();
  readonly labels = workflowLabels;
  readonly ordered = computed(() => [...this.entries()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
  private readonly placeNames = computed(() => new Map(this.store.places().map(place => [place.id, place.name])));

  exists(id?: string) {
    return id !== undefined && this.placeNames().has(id);
  }
  titleFor(request: WorkflowRequest) {
    return request.kind === "new" ? request.patch?.name || "Địa điểm đề xuất"
      : this.placeNames().get(request.placeId ?? "") || request.before?.name || "Địa điểm trong yêu cầu";
  }
}

const changeKinds: ChangeKind[] = ["details", "hours", "temporary-move", "permanent-move", "pause", "closed"];
const fieldsFor = (place: Place | null) => ({
  name: place?.name ?? "", area: place?.area ?? "", category: place?.category ?? "food" as const,
  description: place?.description ?? "", hours: place?.hours ?? "",
  productsText: place?.products.join("\n") ?? "", lat: place?.lat ?? null, lng: place?.lng ?? null,
  price: place?.price ?? null,
});

function dateInput(value?: string): string {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return value;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return `${value}T00:00`;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms + 7 * 3600_000).toISOString().slice(0, 16) : "";
}

@Component({
  selector: "tg-proposal-form",
  standalone: true,
  imports: [DatePipe, FormsModule, Icon],
  templateUrl: "./proposal-form.html",
})
export class ProposalForm {
  private readonly workflow = inject(WorkflowStore);
  private readonly injector = inject(Injector);
  private readonly heading = viewChild<ElementRef<HTMLHeadingElement>>("heading");
  readonly store = inject(TravelStore);
  readonly actor = input.required<"user" | "owner">();
  readonly kind = input.required<RequestKind>();
  readonly place = input<Place | null>(null);
  readonly editing = input<WorkflowRequest | null>(null);
  readonly focusOnOpen = input(false);
  readonly completed = output<void>();
  readonly cancel = output<void>();
  readonly categories = CATEGORIES.filter(category => category.id !== "all");
  readonly changes = changeKinds;
  readonly labels = workflowLabels;
  readonly change = signal<ChangeKind>("details");
  readonly photo = signal("");
  readonly photoReading = signal(false);
  readonly saving = signal(false);
  readonly error = signal("");
  readonly rebased = signal(false);
  private readonly openingRevision = signal<string | null>(null);
  readonly stale = computed(() => this.kind() === "update" && this.openingRevision() !== placeRevision(this.place() ?? undefined));
  readonly creating = computed(() => this.kind() === "new");
  readonly move = computed(() => this.kind() === "update" && (this.change() === "temporary-move" || this.change() === "permanent-move"));
  readonly details = computed(() => this.creating() || (this.kind() === "update" && this.change() === "details"));
  readonly review = computed(() => this.store.visibleReviewFor(this.place()?.id ?? ""));
  readonly reviewPhotos = computed(() => this.store.visibleReviewPhotos(this.place()?.id ?? ""));
  readonly reportAvailable = computed(() => {
    const review = this.review();
    const request = this.editing();
    return !!review && (!request || (request.reviewVersion === review.updatedAt &&
      (request.photoIndex === undefined || this.reviewPhotos().some(photo => photo.index === request.photoIndex))));
  });
  fields = fieldsFor(null);
  reason = "";
  relationship: "owner" | "representative" = "owner";
  evidence = "";
  agreement = false;
  hcmConfirmed = false;
  effectiveFrom = "";
  effectiveUntil = "";
  credit = "";
  rightsConfirmed = false;
  photoIndex: number | null = null;
  private baseline = fieldsFor(null);
  private loaded = "";
  private photoReadId = 0;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.photoReadId++);
    effect(() => {
      const place = this.place();
      const request = this.editing();
      const key = `${this.actor()}|${this.kind()}|${place?.id ?? ""}|${request?.id ?? ""}|${request?.updatedAt ?? ""}`;
      if (key === this.loaded) return;
      this.loaded = key;
      this.reset(place, request);
      if (request || this.focusOnOpen()) {
        afterNextRender(() => this.heading()?.nativeElement.focus(), {injector: this.injector});
      }
    });
  }

  private reset(place: Place | null, request: WorkflowRequest | null) {
    this.photoReadId++;
    this.photoReading.set(false);
    this.baseline = fieldsFor(place);
    this.openingRevision.set(placeRevision(place ?? undefined));
    this.rebased.set(false);
    const patch = request?.patch;
    this.fields = {
      ...this.baseline,
      ...patch,
      hours: patch?.hours === undefined ? this.baseline.hours : patch.hours ?? "",
      productsText: patch?.products?.join("\n") ?? this.baseline.productsText,
    };
    this.reason = request?.reason ?? "";
    this.relationship = request?.relationship ?? "owner";
    this.evidence = request?.evidence ?? "";
    this.agreement = request?.agreement ?? false;
    this.hcmConfirmed = request?.hcmConfirmed ?? false;
    this.effectiveFrom = dateInput(request?.effectiveFrom);
    this.effectiveUntil = dateInput(request?.effectiveUntil);
    this.change.set(request?.change ?? "details");
    this.photo.set(patch?.photo?.dataUrl ?? "");
    this.credit = patch?.photo?.credit ?? "";
    this.rightsConfirmed = patch?.photo?.rightsConfirmed ?? false;
    this.photoIndex = request?.photoIndex ?? null;
    this.error.set("");
  }

  rebase() {
    const place = this.place();
    if (!place || this.saving()) return;
    const keys = Object.keys(this.baseline) as (keyof typeof this.baseline)[];
    const edited = Object.fromEntries(keys.filter(key => this.fields[key] !== this.baseline[key])
      .map(key => [key, this.fields[key]]));
    this.baseline = fieldsFor(place);
    this.fields = { ...this.baseline, ...edited };
    this.openingRevision.set(placeRevision(place));
    this.rebased.set(true);
    this.error.set("");
  }

  async readPhoto(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file || this.photoReading()) return;
    const error = validatePhoto(file, 0);
    this.error.set(error);
    if (error) return;
    const requestId = ++this.photoReadId;
    const url = URL.createObjectURL(file);
    this.photoReading.set(true);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      if (!image.naturalWidth || image.naturalWidth * image.naturalHeight > 60_000_000) throw new Error("Ảnh không hợp lệ");
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(reader.error);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      if (requestId === this.photoReadId) {
        this.photo.set(dataUrl);
        this.credit = "";
        this.rightsConfirmed = false;
      }
    } catch {
      if (requestId === this.photoReadId) this.error.set("Chưa đọc được ảnh. Hãy chọn ảnh JPG, PNG hoặc WebP hợp lệ.");
    } finally {
      URL.revokeObjectURL(url);
      if (requestId === this.photoReadId) this.photoReading.set(false);
    }
  }

  removePhoto() {
    this.photo.set("");
    this.credit = "";
    this.rightsConfirmed = false;
  }

  private patch(): PlacePatch {
    const { fields, baseline } = this;
    const patch: PlacePatch = {};
    if (this.details()) {
      if (this.creating() || fields.name.trim() !== baseline.name) patch.name = fields.name.trim();
      if (this.creating() || fields.area.trim() !== baseline.area) patch.area = fields.area.trim();
      if (this.creating() || fields.category !== baseline.category) patch.category = fields.category;
      if (fields.description.trim() !== baseline.description) patch.description = fields.description.trim();
      const products = fields.productsText.split(/\n/).map(product => product.trim()).filter(Boolean);
      if (products.join("\n") !== baseline.productsText) patch.products = products;
      if (fields.price !== baseline.price) patch.price = fields.price;
      if (this.photo()) patch.photo = {dataUrl: this.photo(), credit: this.credit.trim(), rightsConfirmed: this.rightsConfirmed};
    }
    if (this.creating() || this.change() === "hours") {
      if (fields.hours.trim() !== baseline.hours) patch.hours = fields.hours.trim() || null;
    }
    if (this.creating() || this.move()) {
      if (this.move() && fields.area.trim() !== baseline.area) patch.area = fields.area.trim();
      if (fields.lat !== baseline.lat || fields.lng !== baseline.lng) {
        patch.lat = fields.lat;
        patch.lng = fields.lng;
      }
    }
    return patch;
  }

  async send() {
    if (this.saving() || this.photoReading()) return;
    this.error.set("");
    const kind = this.kind();
    const placeId = this.place()?.id;
    const review = this.review();
    const editing = this.editing();
    if (kind !== "new" && !placeId) return this.error.set("Hãy chọn địa điểm trước khi gửi.");
    if (kind === "report" && !this.reportAvailable()) return this.error.set("Đánh giá hoặc ảnh trong yêu cầu đã thay đổi.");
    if (this.stale()) return this.error.set("Hãy đối chiếu với hồ sơ hiện hành trước khi gửi.");
    const draft: WorkflowDraft = {kind, placeId, reason: this.reason.trim()};
    if (kind === "new" || kind === "update") {
      draft.patch = this.patch();
      draft.hcmConfirmed = this.hcmConfirmed;
      if (kind === "update") {
        draft.change = this.change();
        draft.expectedRevision = this.openingRevision();
        draft.effectiveFrom = this.effectiveFrom || undefined;
        if (this.change() === "temporary-move" || this.change() === "pause") draft.effectiveUntil = this.effectiveUntil || undefined;
      }
    }
    if (kind === "claim") {
      draft.relationship = this.relationship;
      draft.evidence = this.evidence.trim();
      draft.agreement = this.agreement;
    }
    if (kind === "report" && review) {
      draft.reviewVersion = review.updatedAt;
      draft.photoIndex = this.photoIndex ?? undefined;
    }
    this.saving.set(true);
    try {
      const saved = editing ? await this.workflow.resubmit(this.actor(), editing.id, draft) : await this.workflow.submit(this.actor(), draft);
      if (saved) this.completed.emit();
      else this.error.set(this.store.notice() || "Chưa lưu được yêu cầu. Hãy kiểm tra lại nội dung và thử lại.");
    } finally {
      this.saving.set(false);
    }
  }
}
