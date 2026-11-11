export interface Coordinates { lat: number; lng: number; }
export function hasCoordinates<T extends { lat: number | null; lng: number | null }>(point: T): point is T & Coordinates {
  return typeof point.lat === "number" && typeof point.lng === "number" &&
    Number.isFinite(point.lat) && Number.isFinite(point.lng) && Math.abs(point.lat) <= 90 && Math.abs(point.lng) <= 180;
}

export const NEARBY_RADIUS_METERS = 5_000;

export function nearbyMapPoints<T extends { lat: number | null; lng: number | null }>(points: readonly T[], center: Coordinates) {
  const radians = Math.PI / 180;
  return points.filter((point): point is T & Coordinates => {
    if (!hasCoordinates(point)) return false;
    const latitude = (point.lat - center.lat) * radians;
    const longitude = (point.lng - center.lng) * radians;
    const haversine = Math.sin(latitude / 2) ** 2 +
      Math.cos(center.lat * radians) * Math.cos(point.lat * radians) * Math.sin(longitude / 2) ** 2;
    const distance = 2 * 6_371_000 * Math.asin(Math.sqrt(Math.min(1, haversine)));
    return distance <= NEARBY_RADIUS_METERS;
  });
}

// Adapted from Didaune MapPage's grid grouping. Pixel cells keep every zoom bounded.
export function groupMapPoints<T extends Coordinates>(points: readonly T[], zoom: number, cellSize = 64) {
  const scale = 256 * 2 ** zoom;
  const buckets = new Map<string, T[]>();
  for (const point of points) {
    const sin = Math.sin(Math.max(-85.05112878, Math.min(85.05112878, point.lat)) * Math.PI / 180);
    const x = (point.lng + 180) / 360 * scale;
    const y = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale;
    const key = `${Math.floor(x / cellSize)}:${Math.floor(y / cellSize)}`;
    const bucket = buckets.get(key) ?? [];
    bucket.push(point);
    buckets.set(key, bucket);
  }
  return [...buckets.values()].map(places => ({
    places,
    lat: places.reduce((sum, point) => sum + point.lat, 0) / places.length,
    lng: places.reduce((sum, point) => sum + point.lng, 0) / places.length,
  }));
}
