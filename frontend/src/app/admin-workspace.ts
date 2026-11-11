import { DatePipe } from "@angular/common";
import { Component, ElementRef, computed, inject, linkedSignal, signal, viewChild } from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { map } from "rxjs";
import { CATEGORIES, money } from "./data";
import { Icon } from "./icon";
import { normalize } from "./logic";
import { TravelStore } from "./store";
import { WorkflowMap } from "./workflow-map";
import { workflowLabels } from "./workflow";
import type { ReportAction, RequestKind, RequestStatus, WorkflowDecision, WorkflowRequest } from "./workflow";
import { WorkflowStore } from "./workflow-store";

type QueueStatus = "" | "processed" | RequestStatus;
const PAGE_SIZE = 12;

@Component({
  standalone: true,
  imports: [DatePipe, FormsModule, RouterLink, Icon, WorkflowMap],
  templateUrl: "./admin-workspace.html",
  styleUrl: "./admin-workspace.css",
})
export class AdminWorkspace {
  private readonly workflow = inject(WorkflowStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly closeButton = viewChild.required<ElementRef<HTMLButtonElement>>("closeButton");
  private readonly queueTitle = viewChild.required<ElementRef<HTMLHeadingElement>>("queueTitle");
  readonly store = inject(TravelStore);
  readonly labels = workflowLabels;
  readonly kinds = Object.entries(workflowLabels.kind);
  readonly statuses = Object.entries(workflowLabels.status);
  readonly quickStatuses: { key: QueueStatus; label: string }[] = [
    { key: "", label: "Tất cả" },
    { key: "pending", label: "Đang chờ" },
    { key: "needs-info", label: "Cần bổ sung" },
    { key: "processed", label: "Đã xử lý" },
  ];
  readonly selectedId = signal("");
  readonly kind = toSignal(this.route.queryParamMap.pipe(map(params => {
    const kind = params.get("loai") ?? "";
    return Object.hasOwn(workflowLabels.kind, kind) ? kind as RequestKind : "";
  })), { initialValue: "" });
  readonly status = signal<QueueStatus>("");
  readonly query = signal("");
  readonly saving = signal(false);
  readonly showMap = signal(false);
  readonly feedback = signal<{ message: string; saved: boolean } | null>(null);
  private readonly page = linkedSignal(() => {
    this.kind();
    return 1;
  });
  private opener?: HTMLButtonElement;
  reason = "";
  reportAction: ReportAction = "keep";
  readonly selected = computed(() => this.workflow.requests().find(item => item.id === this.selectedId()));
  readonly staleUpdate = computed(() => {
    const item = this.selected();
    return item?.kind === "update" && item.status === "pending" && this.store.catalogStatus() === "ready" &&
      item.baseRevision !== this.workflow.revision(item.placeId);
  });
  readonly heading = computed(() => {
    const kind = this.kind();
    return kind ? this.labels.kind[kind] : "Xét duyệt yêu cầu";
  });
  readonly requests = computed(() => {
    const kind = this.kind();
    return this.workflow.requests().filter(item => !kind || item.kind === kind);
  });
  readonly counts = computed(() => {
    const result = { "": 0, pending: 0, "needs-info": 0, approved: 0, rejected: 0, withdrawn: 0, revoked: 0, processed: 0 };
    for (const item of this.requests()) {
      result[""]++;
      result[item.status]++;
      if (this.processed(item.status)) result.processed++;
    }
    return result;
  });
  readonly filtered = computed(() => {
    const query = normalize(this.query());
    const status = this.status();
    return this.requests().filter(item =>
      (!status || (status === "processed" ? this.processed(item.status) : item.status === status)) &&
      (!query || normalize(`${this.title(item)} ${this.address(item) ?? ""} ${this.labels.actor[item.actor]} ${item.reason}`).includes(query)),
    ).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  });
  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.filtered().length / PAGE_SIZE)));
  readonly currentPage = computed(() => Math.min(this.page(), this.totalPages()));
  readonly pageEntries = computed(() => this.filtered().slice((this.currentPage() - 1) * PAGE_SIZE, this.currentPage() * PAGE_SIZE));
  readonly targetReview = computed(() => {
    const item = this.selected();
    if (item?.kind !== "report" || !item.placeId) return undefined;
    const review = this.store.reviewFor(item.placeId);
    return review?.updatedAt === item.reviewVersion ? review : undefined;
  });
  readonly coordinates = computed(() => {
    const item = this.selected();
    if (!item || (item.kind !== "update" && item.kind !== "new")) return null;
    const before = item.before;
    const afterLat = item.patch?.lat === undefined ? before?.lat : item.patch.lat;
    const afterLng = item.patch?.lng === undefined ? before?.lng : item.patch.lng;
    if (before?.lat === afterLat && before?.lng === afterLng) return null;
    const points = [];
    if (before?.lat != null && before.lng != null) points.push({ lat: before.lat, lng: before.lng, label: "Vị trí trước đề xuất" });
    if (afterLat != null && afterLng != null) points.push({ lat: afterLat, lng: afterLng, label: "Vị trí đề xuất" });
    return points.length ? points : null;
  });

  private processed(status: RequestStatus) {
    return status === "approved" || status === "rejected" || status === "revoked";
  }
  title(item: WorkflowRequest) {
    if (item.kind === "new") return item.patch?.name || "Địa điểm mới";
    return item.before?.name || this.store.places().find(place => place.id === item.placeId)?.name || "Địa điểm trong yêu cầu";
  }
  address(item: WorkflowRequest) {
    return item.kind === "new" ? item.patch?.area : item.before?.area;
  }
  rowAction(item: WorkflowRequest) {
    if (item.status === "pending") return "Đối chiếu";
    if (item.status === "needs-info") return "Xem phản hồi";
    return "Xem kết quả";
  }
  changeQuery(query: string) {
    this.query.set(query);
    this.page.set(1);
  }
  changeStatus(status: QueueStatus) {
    this.status.set(status);
    this.page.set(1);
  }
  changeKind(kind: string) {
    this.page.set(1);
    void this.router.navigate([], { relativeTo: this.route, queryParams: { loai: kind || null }, queryParamsHandling: "merge" });
  }
  clearFilters() {
    this.changeQuery("");
    this.changeStatus("");
    if (this.kind()) this.changeKind("");
  }
  turnPage(offset: number) {
    this.page.set(this.currentPage() + offset);
  }
  compare(item: WorkflowRequest) {
    const patch = item.patch ?? {};
    const before = item.before;
    const category = (id: string | undefined) => CATEGORIES.find(category => category.id === id)?.name;
    const rows = [
      { label: "Tên", before: before?.name, after: patch.name },
      { label: "Địa chỉ / khu vực", before: before?.area, after: patch.area },
      { label: "Danh mục", before: category(before?.category), after: category(patch.category) },
      { label: "Mô tả", before: before?.description, after: patch.description },
      { label: "Giờ bán", before: before?.hours, after: patch.hours },
      { label: "Món chính", before: before?.products.join(", "), after: patch.products?.join(", ") },
      { label: "Giá tham khảo", before: before ? money(before.price) : undefined, after: patch.price !== undefined ? money(patch.price) : undefined },
      { label: "Vĩ độ", before: before?.lat, after: patch.lat },
      { label: "Kinh độ", before: before?.lng, after: patch.lng },
      { label: "Ảnh bìa", before: before?.image ? "Có ảnh" : "Chưa có ảnh", after: patch.photo ? "Ảnh do người gửi cung cấp" : undefined },
    ];
    return rows.filter(row => row.after !== undefined && row.after !== row.before);
  }
  select(item: WorkflowRequest, dialog: HTMLDialogElement, opener: HTMLButtonElement) {
    this.opener = opener;
    this.selectedId.set(item.id);
    this.reason = "";
    this.reportAction = "keep";
    this.showMap.set(false);
    this.feedback.set(null);
    dialog.showModal();
  }
  closeDetails() {
    this.selectedId.set("");
    this.showMap.set(false);
    this.feedback.set(null);
    const opener = this.opener;
    const title = this.queueTitle().nativeElement;
    this.opener = undefined;
    requestAnimationFrame(() => {
      if (!this.selectedId() && title.isConnected) {
        (opener?.isConnected ? opener : title).focus({ preventScroll: true });
      }
    });
  }
  async decide(item: WorkflowRequest, decision: WorkflowDecision) {
    const eligible = decision === "revoked" ? item.kind === "claim" && item.status === "approved" : item.status === "pending";
    if (this.saving() || !eligible || !this.reason.trim()) return;
    this.saving.set(true);
    this.feedback.set(null);
    try {
      const saved = await this.workflow.decide(item.id, decision, this.reason, item.kind === "report" ? this.reportAction : undefined);
      if (this.selectedId() !== item.id) return;
      this.feedback.set({ message: this.store.notice(), saved });
      if (saved) {
        this.reason = "";
        this.closeButton().nativeElement.focus({ preventScroll: true });
      }
    } finally { this.saving.set(false); }
  }
}
