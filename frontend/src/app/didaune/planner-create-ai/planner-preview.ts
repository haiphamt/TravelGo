import type { Place } from '../../data.ts';
import { hasCoordinates } from '../../geo.ts';
import { normalize, type TripItem } from '../../logic.ts';
import { suggestTrip, type SuggestionInput } from '../../trip-suggestion.ts';

const DAY = 86_400_000;
const plain = (value: string) => normalize(value).replace(/[^a-z0-9]+/g, ' ').trim();
const cityNames = new Set(['tp hcm', 'tphcm', 'hcm', 'ho chi minh', 'tp ho chi minh', 'thanh pho ho chi minh', 'sai gon']);

export function plannerArea(destination: string): string {
  return cityNames.has(plain(destination)) ? '' : destination.trim();
}

export function buildPlannerPreview(catalog: readonly Place[], input: SuggestionInput, desiredPlaces: string, start: string, end: string) {
  const places: Place[] = [];
  const unmatched: string[] = [];
  const area = plain(input.area);
  const candidates = catalog.filter(place => place.city === 'hcm' && hasCoordinates(place) && !place.demoChange?.status &&
    (!area || ` ${plain(place.area)} `.includes(` ${area} `)));
  const requests = [...new Set(desiredPlaces.split(/[,;\n]/).map(value => value.trim()).filter(Boolean))].slice(0, 5);

  const available = () => {
    const includeLocal = input.includeLocal && !places.some(place => place.local);
    return candidates.filter(place => (includeLocal || !place.local) && !places.includes(place));
  };

  for (const request of requests) {
    if (places.length === input.count) break;
    const remaining = available();
    const name = plain(request);
    if (places.some(place => plain(place.name) === name)) continue;
    const match = remaining.find(place => plain(place.name) === name) ??
      suggestTrip(remaining, { ...input, area: '', count: 1, needs: request })[0];
    if (match) places.push(match);
    else unmatched.push(request);
  }

  const openSlots = input.count - places.length;
  if (openSlots && input.needs.trim()) {
    places.push(...suggestTrip(available(), { ...input, area: '', count: openSlots }));
  }

  // These times are editable placeholders. Spread up to five stops across the selected date range.
  const startTime = Date.parse(start);
  const dayCount = Math.min(places.length, (Date.parse(end) - startTime) / DAY + 1);
  const points: TripItem[] = places.map((place, index) => {
    const day = Math.floor(index * dayCount / places.length);
    const slot = index - Math.ceil(day * places.length / dayCount);
    return {
      placeId: place.id,
      date: new Date(startTime + day * DAY).toISOString().slice(0, 10),
      time: `${String(8 + slot * 2).padStart(2, '0')}:00`,
    };
  });

  return { places, points, unmatched };
}
