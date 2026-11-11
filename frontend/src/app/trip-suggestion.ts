import type { Place } from "./data.ts";
import { hasCoordinates } from "./geo.ts";
import { normalize } from "./logic.ts";

const intents: Record<Place["category"], string[]> = {
  coffee: ["ca phe", "cafe", "coffee"],
  food: ["an uong", "an vat", "an sang", "an trua", "an toi", "quan an", "nha hang", "am thuc"],
  nature: ["cong vien", "thien nhien", "ngoai troi", "di dao"],
  culture: ["tham quan", "bao tang", "van hoa", "di tich", "lich su"],
  drink: ["do uong", "tra sua", "nuoc ep"],
  lodging: ["luu tru", "khach san", "homestay"],
};
const filler = new Set("toi minh muon tim va voi ghe di tai o cho mot chuyen buoi sang trua chieu toi cuoi tuan quanh lich trinh ngay diem den ngon gan du lich xem cung".split(" "));
const plain = (value: string) => normalize(value).replace(/[^a-z0-9]+/g, " ").trim();
const hasPhrase = (text: string, phrase: string) => ` ${text} `.includes(` ${phrase} `);

export interface SuggestionInput {
  needs: string;
  area: string;
  count: number;
  includeLocal: boolean;
}

export function suggestTrip(places: readonly Place[], input: SuggestionInput): Place[] {
  const needs = plain(input.needs);
  const area = plain(input.area);
  if (!needs || !Number.isInteger(input.count) || input.count < 1 || input.count > 5) return [];

  const categories = new Set<Place["category"]>();
  const matchedPhrases: string[] = [];
  let remaining = needs;
  for (const [category, phrases] of Object.entries(intents)) {
    for (const phrase of phrases) {
      if (!hasPhrase(needs, phrase)) continue;
      categories.add(category as Place["category"]);
      matchedPhrases.push(phrase);
      remaining = ` ${remaining} `.replace(` ${phrase} `, " ").trim();
    }
  }
  const terms = [...new Set(remaining.split(" ").filter(word => word.length > 1 && !filler.has(word)))];
  const ranked = places.flatMap(place => {
    if (!hasCoordinates(place) || place.demoChange?.status || (!input.includeLocal && place.local)) return [];
    if (area && !hasPhrase(plain(place.area), area)) return [];
    const searchable = plain(`${place.name} ${place.products.join(" ")} ${place.area}`);
    const keywordHits = terms.filter(term => hasPhrase(searchable, term)).length;
    if (categories.size ? !categories.has(place.category) : !terms.length || keywordHits !== terms.length) return [];
    const categoryHits = matchedPhrases.filter(phrase => hasPhrase(searchable, phrase)).length;
    const hasArea = place.area !== "Chưa cập nhật địa chỉ" && Boolean(place.area.trim());
    return [{ place, score: keywordHits * 4 + categoryHits * 2 + Number(hasArea) }];
  }).sort((a, b) => b.score - a.score);

  const result: Place[] = [];
  const local = input.includeLocal ? ranked.find(item => item.place.local)?.place : undefined;
  if (local) result.push(local);
  for (const category of categories) {
    if (result.length >= input.count) break;
    if (result.some(place => place.category === category)) continue;
    const match = ranked.find(item => !item.place.local && item.place.category === category);
    if (match) result.push(match.place);
  }
  for (const { place } of ranked) {
    if (result.length >= input.count) break;
    if (!place.local && !result.some(item => item.id === place.id)) result.push(place);
  }
  return result;
}
