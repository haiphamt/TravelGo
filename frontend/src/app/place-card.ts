import { Component, computed, inject, input, signal } from "@angular/core";
import { RouterLink } from "@angular/router";
import { CATEGORIES, Place, money } from "./data";
import { mapQuery } from "./discovery";
import { TravelStore } from "./store";

@Component({
  selector: "tg-place-card",
  standalone: true,
  imports: [RouterLink],
  templateUrl: "./place-card.html",
  styleUrl: "./place-card.css",
  host: { class: "didaune-ui" },
})
export class PlaceCard {
  readonly place = input.required<Place>();
  readonly context = input<Record<string, string | null>>({});
  readonly store = inject(TravelStore);
  readonly money = money;
  readonly failedPhoto = signal<string | null>(null);
  readonly isFavorite = computed(() => this.store.hasFavorite(this.place().id));
  readonly review = computed(() => this.store.visibleReviewFor(this.place().id));
  readonly suggestedHours = computed(() => this.place().localProfile?.hours.summary || this.place().hours);
  readonly categoryLabel = computed(() =>
    this.place().localProfile?.categoryLabel ?? CATEGORIES.find(category => category.id === this.place().category)?.name,
  );
  readonly mapParams = computed(() => mapQuery({ get: name => this.context()[name] ?? null }, this.place().id));
}
