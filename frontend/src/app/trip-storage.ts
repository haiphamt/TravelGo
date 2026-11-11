import { EMPTY_STATE, validTripBudget, validTripCover, validTripDate, validTripTime } from "./logic.ts";
import type { DemoState, SavedTrip, TripItem } from "./logic.ts";
import { validTripSnapshot } from "./workflow.ts";

export function validPlaceId(id: unknown): id is string {
  return typeof id === "string" && /^(?:osm:(?:node|way|relation)\/\d+|tg-(?:local|demo)-[a-f0-9-]{36})$/.test(id);
}

function restorePoints(points: TripItem[] | undefined, start: string, end: string): TripItem[] {
  if (!Array.isArray(points)) return [];
  return points.filter(point => point && validPlaceId(point.placeId) && validTripTime(point.time)).map(point => ({
    placeId: point.placeId,
    time: point.time,
    date: point.date && validTripDate(point.date) && start && point.date >= start && point.date <= (end || start) ? point.date : undefined,
    note: typeof point.note === "string" ? point.note.slice(0, 180) : undefined,
    estimatedCost: typeof point.estimatedCost === "number" && validTripBudget(point.estimatedCost) ? point.estimatedCost : undefined,
    snapshot: validTripSnapshot(point.snapshot) ? point.snapshot : undefined,
    keptRevision: typeof point.keptRevision === "string" ? point.keptRevision : undefined,
  }));
}

export function currentTrip(state: DemoState): SavedTrip {
  return {
    id: state.tripId ?? "legacy",
    name: state.tripName,
    date: state.tripDate,
    endDate: state.tripEndDate,
    note: state.tripNote,
    budget: state.tripBudget,
    cover: state.tripCover,
    source: state.tripSource,
    points: state.trip,
  };
}

export function hasActiveTrip(state: DemoState): boolean {
  return Boolean(state.tripId || state.trip.length || state.tripDate || state.tripNote ||
    state.tripCover || state.tripBudget != null || state.tripName !== EMPTY_STATE.tripName);
}

export function activateTrip(state: DemoState, next: SavedTrip): DemoState {
  const savedTrips = (state.savedTrips ?? []).filter(trip => trip.id !== next.id);
  return {
    ...state,
    tripId: next.id,
    trip: next.points,
    tripName: next.name,
    tripDate: next.date,
    tripEndDate: next.endDate,
    tripNote: next.note,
    tripBudget: next.budget,
    tripCover: next.cover,
    tripSource: next.source,
    savedTrips: hasActiveTrip(state) ? [currentTrip(state), ...savedTrips] : savedTrips,
  };
}

export function restoreTripFields(candidate: DemoState) {
  const active = restoreTrip(currentTrip({ ...candidate, tripId: typeof candidate.tripId === "string" ? candidate.tripId : undefined }));
  const seen = new Set([active.id]);
  const savedTrips: SavedTrip[] = [];
  for (const entry of Array.isArray(candidate.savedTrips) ? candidate.savedTrips : []) {
    if (!entry || typeof entry.id !== "string" || !entry.id || seen.has(entry.id)) continue;
    seen.add(entry.id);
    savedTrips.push(restoreTrip(entry));
  }
  return {
    trip: active.points,
    tripName: active.name,
    tripDate: active.date,
    tripEndDate: active.endDate,
    tripNote: active.note,
    tripBudget: active.budget,
    tripCover: active.cover,
    tripSource: active.source,
    tripId: typeof candidate.tripId === "string" ? candidate.tripId : undefined,
    savedTrips,
  };
}

function restoreTrip(trip: SavedTrip): SavedTrip {
  const date = typeof trip.date === "string" && validTripDate(trip.date) ? trip.date : "";
  const endDate = date && typeof trip.endDate === "string" && validTripDate(trip.endDate) && trip.endDate >= date ? trip.endDate : "";
  return {
    id: trip.id,
    name: typeof trip.name === "string" ? trip.name.slice(0, 80) : EMPTY_STATE.tripName,
    date,
    endDate,
    note: typeof trip.note === "string" ? trip.note.slice(0, 500) : "",
    budget: typeof trip.budget === "number" && validTripBudget(trip.budget) ? trip.budget : null,
    cover: validTripCover(trip.cover) ? trip.cover : undefined,
    source: trip.source === "ai-demo" || trip.source === "room" ? trip.source : "manual",
    points: restorePoints(trip.points, date, endDate),
  };
}
