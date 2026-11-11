import { DatePipe } from "@angular/common";
import { Component, computed, inject, signal } from "@angular/core";
import { Router, RouterLink } from "@angular/router";
import { money } from "../../data";
import { TravelStore } from "../../store";
import { currentTrip, hasActiveTrip } from "../../trip-storage";

// Didaune features/planner-list at 04597f6. TravelGo reads the existing local trips.
@Component({
  standalone: true,
  imports: [DatePipe, RouterLink],
  host: { class: "didaune-ui" },
  templateUrl: "./planner-list.html",
  styleUrl: "./planner-list.css",
})
export class PlannerList {
  readonly store = inject(TravelStore);
  private readonly router = inject(Router);
  readonly opening = signal(false);
  readonly money = money;
  readonly trips = computed(() => {
    const state = this.store.state();
    const saved = state.savedTrips ?? [];
    return hasActiveTrip(state) ? [currentTrip(state), ...saved] : saved;
  });

  async open(id: string) {
    if (this.opening()) return;
    this.opening.set(true);
    try {
      if (id === currentTrip(this.store.state()).id || await this.store.switchTrip(id)) {
        await this.router.navigate(["/lich-trinh", "chinh-sua"]);
      }
    } finally {
      this.opening.set(false);
    }
  }
}
