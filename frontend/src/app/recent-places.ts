import { Injectable, signal } from "@angular/core";
import { validPlaceId } from "./trip-storage";

const storageKey = "travelgo-recent-places";
const limit = 8;

function readRecentIds(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
    return Array.isArray(value) ? [...new Set(value.filter(validPlaceId))].slice(0, limit) : [];
  } catch {
    return [];
  }
}

@Injectable({ providedIn: "root" })
export class RecentPlaces {
  private readonly history = signal(readRecentIds());
  readonly ids = this.history.asReadonly();

  record(id: string) {
    const current = this.history();
    if (current[0] === id) return;
    const next = [id, ...current.filter(item => item !== id)].slice(0, limit);
    this.history.set(next);
    try { localStorage.setItem(storageKey, JSON.stringify(next)); }
    catch { /* History still works in memory when browser storage is unavailable. */ }
  }

  clear() {
    this.history.set([]);
    try { localStorage.removeItem(storageKey); }
    catch { /* The in-memory history is already clear. */ }
  }
}
