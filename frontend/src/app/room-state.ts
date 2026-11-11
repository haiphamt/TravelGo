export interface RoomMember {
  id: string;
  name: string;
}

export interface RoomPlace {
  placeId: string;
  name: string;
}

interface RoomVote {
  memberId: string;
  placeId: string;
}

export interface RoomStop extends RoomPlace {
  time: string;
  snapshot?: TripSnapshot;
  keptRevision?: string;
}

export interface GroupRoomRecord {
  code: string;
  title: string;
  date: string;
  desiredStops: number;
  votingOpened: boolean;
  ownerId: string;
  activeMemberId: string;
  members: RoomMember[];
  places: RoomPlace[];
  votes: RoomVote[];
  result: RoomStop[];
  itinerary?: RoomStop[];
}

export interface RoomState {
  rooms: GroupRoomRecord[];
  activeCode: string;
}

export const ROOM_PLACE_LIMIT = 12;
export const ROOM_MEMBER_LIMIT = 12;
export const ROOM_STOP_LIMIT = 5;
export const EMPTY_ROOM_STATE: RoomState = { rooms: [], activeCode: "" };

export function defaultRoomTime(index: number): string {
  return `${String(8 + index * 2).padStart(2, "0")}:00`;
}

export function validRoomTime(time: unknown): time is string {
  return typeof time === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
}

export function validStopCount(count: unknown): count is number {
  return typeof count === "number" && Number.isInteger(count) && count >= 1 && count <= ROOM_STOP_LIMIT;
}

export function validRoomDate(value: unknown): value is string {
  if (value === "") return true;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const day = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(day.getTime()) && day.toISOString().slice(0, 10) === value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isLabel(value: unknown, max: number): value is string {
  return typeof value === "string" && !!value.trim() && value.length <= max;
}

function isMember(value: unknown): value is RoomMember {
  return isRecord(value) && isLabel(value.id, 36) && isLabel(value.name, 40);
}

function isPlace(value: unknown): value is RoomPlace {
  return isRecord(value) && isLabel(value.placeId, 64) && isLabel(value.name, 250);
}

function uniqueBy<T>(items: T[], key: (item: T) => string): T[] {
  return [...new Map(items.map(item => [key(item), item])).values()];
}

function restoreRoom(value: unknown): GroupRoomRecord | null {
  if (!isRecord(value)) return null;
  const { code, title, date, ownerId, activeMemberId } = value;
  if (typeof code !== "string" || !/^[A-F0-9]{8}$/.test(code) || !isLabel(title, 80) ||
      !validRoomDate(date) || typeof ownerId !== "string" || !Array.isArray(value.members)) return null;

  const members = uniqueBy(value.members.filter(isMember), member => member.id).slice(0, ROOM_MEMBER_LIMIT);
  const memberIds = new Set(members.map(member => member.id));
  if (!memberIds.has(ownerId)) return null;
  const places = Array.isArray(value.places)
    ? uniqueBy(value.places.filter(isPlace), place => place.placeId).slice(0, ROOM_PLACE_LIMIT) : [];
  const placeIds = new Set(places.map(place => place.placeId));
  const votes = Array.isArray(value.votes) ? uniqueBy(value.votes.filter((vote): vote is RoomVote =>
    isRecord(vote) && typeof vote.memberId === "string" && typeof vote.placeId === "string" &&
    memberIds.has(vote.memberId) && placeIds.has(vote.placeId)), vote => JSON.stringify([vote.memberId, vote.placeId])) : [];
  const restoreStops = (raw: unknown) => Array.isArray(raw)
    ? uniqueBy(raw.filter((stop): stop is RoomStop => isRecord(stop) && isPlace(stop) && validRoomTime(stop.time)).map(stop => ({
      placeId: stop.placeId, name: stop.name, time: stop.time,
      ...(validTripSnapshot(stop.snapshot) ? { snapshot: stop.snapshot } : {}),
      ...(typeof stop.keptRevision === "string" ? { keptRevision: stop.keptRevision } : {}),
    })), stop => stop.placeId).slice(0, ROOM_STOP_LIMIT) : [];
  const result = restoreStops(value.result).filter(stop => placeIds.has(stop.placeId));
  const itinerary = result.length ? restoreStops(value.itinerary) : [];

  return {
    code, title, date, ownerId, members, places, votes, result,
    desiredStops: validStopCount(value.desiredStops) ? value.desiredStops : Math.max(1, result.length),
    votingOpened: value.votingOpened === true || votes.length > 0 || result.length > 0,
    itinerary: itinerary.length ? itinerary : undefined,
    activeMemberId: typeof activeMemberId === "string" && memberIds.has(activeMemberId) ? activeMemberId : ownerId,
  };
}

export function restoreRoomState(value: unknown): RoomState | undefined {
  if (!isRecord(value) || !Array.isArray(value.rooms)) return undefined;
  const rooms = uniqueBy(value.rooms.map(restoreRoom).filter(room => room !== null), room => room.code);
  return {
    rooms,
    activeCode: rooms.some(room => room.code === value.activeCode) && typeof value.activeCode === "string"
      ? value.activeCode : "",
  };
}

export function saveRoomVotes(room: GroupRoomRecord, memberId: string, placeIds: string[]): GroupRoomRecord | null {
  if (!room.votingOpened || room.result.length || !room.members.some(member => member.id === memberId) ||
      new Set(placeIds).size !== placeIds.length ||
      placeIds.some(id => !room.places.some(place => place.placeId === id))) return null;
  return {
    ...room,
    votes: [...room.votes.filter(vote => vote.memberId !== memberId), ...placeIds.map(placeId => ({ memberId, placeId }))],
  };
}

export function finalizeRoom(
  room: GroupRoomRecord, memberId: string, selectedIds: string[], available: ReadonlyMap<string, string>,
): GroupRoomRecord | null {
  if (room.ownerId !== memberId || !room.votingOpened || room.result.length || !room.votes.length ||
      !selectedIds.length || selectedIds.length > ROOM_STOP_LIMIT || new Set(selectedIds).size !== selectedIds.length ||
      selectedIds.some(id => !available.has(id) || !room.places.some(place => place.placeId === id))) return null;

  const result = selectedIds.map((placeId, index) => ({
    placeId,
    name: available.get(placeId)!.slice(0, 250),
    time: defaultRoomTime(index),
  }));
  return { ...room, result };
}
import type { TripSnapshot } from "./logic.ts";
import { validTripSnapshot } from "./workflow.ts";
