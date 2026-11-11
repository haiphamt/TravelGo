import { Component, computed, inject, signal } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { ActivatedRoute, RouterLink } from "@angular/router";
import { Icon } from "./icon";
import { ProposalForm, WorkflowHistory, WorkflowPlacePicker } from "./proposal-form";
import { TravelStore } from "./store";
import { WorkflowRequest } from "./workflow";
import { WorkflowStore } from "./workflow-store";

type ContributionView = "new" | "update" | "report" | "history";

@Component({
  standalone: true,
  imports: [RouterLink, Icon, ProposalForm, WorkflowHistory, WorkflowPlacePicker],
  templateUrl: "./contributions.html",
})
export class Contributions {
  readonly store = inject(TravelStore);
  private readonly workflow = inject(WorkflowStore);
  readonly view = signal<ContributionView>("new");
  readonly selectedId = signal("");
  private readonly editingId = signal("");
  readonly withdrawing = signal(false);
  readonly entries = computed(() => this.workflow.requests().filter(request => request.actor === "user"));
  readonly editing = computed(() => this.entries().find(request => request.id === this.editingId() && request.status === "needs-info") ?? null);
  readonly place = computed(() => this.store.places().find(place => place.id === this.selectedId()) ?? null);
  readonly formKind = computed(() => {
    const view = this.view();
    return view === "history" ? "new" : view;
  });
  readonly views: { key: ContributionView; label: string }[] = [
    {key: "new", label: "Địa điểm mới"},
    {key: "update", label: "Đề xuất cập nhật"},
    {key: "report", label: "Báo cáo đánh giá"},
    {key: "history", label: "Đóng góp của tôi"},
  ];

  constructor() {
    inject(ActivatedRoute).queryParamMap.pipe(takeUntilDestroyed()).subscribe(params => {
      const place = params.get("place") ?? "";
      this.selectedId.set(place);
      this.changeView(params.get("report") === "review" ? "report" : place ? "update" : "new");
    });
  }

  changeView(view: ContributionView) {
    this.editingId.set("");
    this.view.set(view);
  }

  edit(request: WorkflowRequest) {
    if (request.actor !== "user" || request.status !== "needs-info" || request.kind === "claim") return;
    this.selectedId.set(request.kind === "new" ? "" : request.placeId ?? "");
    this.view.set(request.kind);
    this.editingId.set(request.id);
  }

  async withdraw(id: string) {
    if (this.withdrawing()) return;
    this.withdrawing.set(true);
    try { await this.workflow.withdraw("user", id); }
    finally { this.withdrawing.set(false); }
  }
}
