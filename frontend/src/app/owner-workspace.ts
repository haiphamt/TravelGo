import { DatePipe } from "@angular/common";
import { Component, ElementRef, Injector, afterNextRender, computed, inject, signal, viewChild } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { Icon } from "./icon";
import { ProposalForm, WorkflowHistory, WorkflowPlacePicker } from "./proposal-form";
import { TravelStore } from "./store";
import { WorkflowRequest, workflowLabels } from "./workflow";
import { WorkflowStore } from "./workflow-store";

type OwnerView = "places" | "claim" | "history";

const viewCopy = {
  places: { title: "Địa điểm quản lý", description: "Theo dõi quyền quản lý, đề xuất cập nhật hồ sơ và phản hồi đánh giá tại từng địa điểm." },
  claim: { title: "Xin quyền quản lý", description: "Chọn địa điểm trong danh mục và gửi thông tin để Quản trị viên đối chiếu trong bản thử." },
  history: { title: "Lịch sử yêu cầu", description: "Theo dõi tiến độ xác minh, đề xuất cập nhật và báo cáo đánh giá bạn đã gửi." },
};

@Component({
  standalone: true,
  imports: [DatePipe, FormsModule, RouterLink, Icon, ProposalForm, WorkflowHistory, WorkflowPlacePicker],
  templateUrl: "./owner-workspace.html",
  styleUrl: "./owner-workspace.css",
})
export class OwnerWorkspace {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly claimStatus = viewChild<ElementRef<HTMLHeadingElement>>("claimStatus");
  private readonly replyField = viewChild<ElementRef<HTMLTextAreaElement>>("replyField");
  private readonly replyButton = viewChild<ElementRef<HTMLButtonElement>>("replyButton");
  readonly store = inject(TravelStore);
  readonly workflow = inject(WorkflowStore);
  readonly labels = workflowLabels;
  readonly view = signal<OwnerView>("places");
  readonly page = computed(() => viewCopy[this.view()]);
  readonly linkedId = signal("");
  readonly action = signal<"update" | "report" | null>(null);
  private readonly editingId = signal("");
  readonly withdrawing = signal(false);
  readonly replyEditing = signal(false);
  readonly replyText = signal("");
  readonly replySaving = signal(false);
  readonly replyError = signal("");
  private replyVersion = "";
  readonly entries = computed(() => this.workflow.requests().filter(request => request.actor === "owner"));
  readonly claims = computed(() => this.entries().filter(request => request.kind === "claim")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
  readonly editing = computed(() => this.entries().find(request => request.id === this.editingId() && request.status === "needs-info") ?? null);
  readonly managed = computed(() => {
    const ids = new Set(this.claims().filter(request => request.status === "approved").map(request => request.placeId));
    return this.store.places().filter(place => ids.has(place.id));
  });
  readonly selectedId = computed(() => {
    const placeId = this.editing()?.placeId || this.linkedId();
    if (placeId) return placeId;
    return this.view() === "places" ? this.managed()[0]?.id ?? "" : "";
  });
  readonly place = computed(() => this.store.places().find(place => place.id === this.selectedId()) ?? null);
  readonly canManage = computed(() => !!this.place() && this.workflow.canManage(this.selectedId()));
  readonly selectedClaim = computed(() => this.claims().find(request => request.placeId === this.selectedId()));
  readonly activeClaim = computed(() => this.claims().find(request => request.placeId === this.selectedId()
    && (request.status === "pending" || request.status === "needs-info")));
  readonly review = computed(() => this.canManage() ? this.store.visibleReviewFor(this.selectedId()) : undefined);
  readonly reply = computed(() => this.canManage() ? this.workflow.visibleReply(this.selectedId()) : undefined);

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe(params => {
      const place = params.get("place") ?? "";
      const view = params.get("view");
      this.clearAction();
      this.editingId.set("");
      this.linkedId.set(place);
      const claimView = view === "claim" || (place !== "" && view !== "manage");
      this.view.set(view === "history" ? "history" : claimView ? "claim" : "places");
    });
  }

  selectForClaim(id: string) {
    void this.router.navigate([], { relativeTo: this.route, queryParams: { view: "claim", place: id } });
  }

  showClaimResult() {
    afterNextRender(() => this.claimStatus()?.nativeElement.focus(), { injector: this.injector });
  }

  openHistory() {
    this.editingId.set("");
    void this.router.navigate([], { relativeTo: this.route, queryParams: { view: "history" } });
  }

  edit(request: WorkflowRequest) {
    if (request.actor !== "owner" || request.status !== "needs-info") return;
    this.clearAction();
    this.editingId.set(request.id);
  }

  cancelEdit() {
    this.editingId.set("");
  }

  async withdraw(id: string) {
    if (this.withdrawing()) return;
    this.withdrawing.set(true);
    try { await this.workflow.withdraw("owner", id); }
    finally { this.withdrawing.set(false); }
  }

  showAction(action: "update" | "report") {
    this.cancelReply();
    this.action.set(action);
  }

  clearAction() {
    this.action.set(null);
    this.cancelReply();
  }

  startReply() {
    const review = this.review();
    if (!review) return;
    this.action.set(null);
    this.replyVersion = review.updatedAt;
    this.replyText.set(this.reply()?.text ?? "");
    this.replyError.set("");
    this.replyEditing.set(true);
    afterNextRender(() => this.replyField()?.nativeElement.focus(), { injector: this.injector });
  }

  cancelReply(restoreFocus = false) {
    this.replyEditing.set(false);
    this.replyError.set("");
    if (restoreFocus) afterNextRender(() => this.replyButton()?.nativeElement.focus(), { injector: this.injector });
  }

  async saveReply(remove = false) {
    if (this.replySaving() || !this.canManage()) return;
    const placeId = this.selectedId();
    const text = this.replyText().trim();
    if (!remove && !text) return this.replyError.set("Hãy nhập nội dung phản hồi.");
    const version = remove ? this.review()?.updatedAt : this.replyVersion;
    if (!version) return;
    this.replySaving.set(true);
    this.replyError.set("");
    try {
      const saved = await this.workflow.reply(placeId, remove ? "" : text, version);
      if (placeId !== this.selectedId()) return;
      if (saved) this.cancelReply(true);
      else this.replyError.set(this.store.notice() || "Chưa lưu được phản hồi. Hãy thử lại.");
    } finally {
      this.replySaving.set(false);
    }
  }
}
