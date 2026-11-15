<?php

namespace App\Services;

use App\Contracts\ItinerarySuggestionProvider;
use Illuminate\Support\Str;

class MockItinerarySuggestionProvider implements ItinerarySuggestionProvider
{
    private const INTENTS = [
        'coffee' => ['ca phe', 'cafe', 'coffee'],
        'food' => ['an uong', 'an vat', 'am thuc', 'quan an', 'nha hang', 'an sang', 'an trua', 'an toi'],
        'nature' => ['cong vien', 'thien nhien', 'di dao', 'ngoai troi'],
        'culture' => ['tham quan', 'bao tang', 'van hoa', 'di tich', 'lich su'],
        'drink' => ['do uong', 'tra sua', 'nuoc ep'],
        'lodging' => ['luu tru', 'khach san', 'homestay'],
    ];

    private const FILLER = 'toi minh muon tim va voi ghe di tai o cho mot chuyen buoi sang trua chieu toi cuoi tuan quanh lich trinh ngay diem den ngon gan du lich xem cung';

    public static function plain(string $text): string
    {
        return trim(preg_replace('/[^a-z0-9]+/', ' ', strtolower(Str::ascii($text))));
    }

    public function suggest(array $catalog, array $input): array
    {
        $selected = [];
        $includeLocal = $input['includeLocal'] ?? true;
        $available = function () use ($catalog, &$selected, $includeLocal) {
            $hasLocal = (bool) array_filter($selected, fn ($p) => $p['local']);

            return array_values(array_filter($catalog, fn ($p) => ! in_array($p['id'], array_column($selected, 'id'), true) &&
                (! $p['local'] || ($includeLocal && ! $hasLocal))));
        };
        foreach ($input['requested'] ?? [] as $request) {
            if (count($selected) >= $input['count']) {
                break;
            }
            if (in_array(self::plain($request), array_map(fn ($p) => self::plain($p['name']), $selected), true)) {
                continue;
            }
            $remaining = $available();
            $exact = array_values(array_filter($remaining, fn ($p) => self::plain($p['name']) === self::plain($request)));
            $match = $exact[0] ?? (self::rankedSelection($remaining, $request, 1, $includeLocal)[0] ?? null);
            if ($match) {
                $selected[] = $match;
            }
        }
        $slots = $input['count'] - count($selected);
        if ($slots > 0 && trim($input['needs'] ?? '') !== '') {
            array_push($selected, ...self::rankedSelection($available(), $input['needs'], $slots, $includeLocal));
        }

        return array_column($selected, 'id');
    }

    /** Follow the category/keyword selection in Angular trip-suggestion.ts. */
    private static function rankedSelection(array $catalog, string $query, int $count, bool $includeLocal): array
    {
        $needs = self::plain($query);
        $categories = [];
        $matched = [];
        $remaining = $needs;
        foreach (self::INTENTS as $category => $phrases) {
            foreach ($phrases as $phrase) {
                if (self::hasPhrase($needs, $phrase)) {
                    $categories[$category] = true;
                    $matched[] = $phrase;
                    $remaining = trim(preg_replace('/ '.preg_quote($phrase, '/').' /', ' ', " $remaining ", 1));
                }
            }
        }
        $filler = explode(' ', self::FILLER);
        $terms = array_values(array_unique(array_filter(explode(' ', $remaining), fn ($word) => strlen($word) > 1 && ! in_array($word, $filler, true))));
        $ranked = [];
        foreach ($catalog as $index => $place) {
            if ($place['local'] && ! $includeLocal) {
                continue;
            }
            $search = self::plain($place['name'].' '.implode(' ', $place['products'] ?? []).' '.$place['area']);
            $hits = count(array_filter($terms, fn ($term) => self::hasPhrase($search, $term)));
            if ($categories ? ! isset($categories[$place['category']]) : (! $terms || $hits !== count($terms))) {
                continue;
            }
            $score = $hits * 4 + count(array_filter($matched, fn ($phrase) => self::hasPhrase($search, $phrase))) * 2;
            $score += (int) ($place['area'] !== 'Chưa cập nhật địa chỉ' && trim($place['area']) !== '');
            $ranked[] = ['place' => $place, 'score' => $score, 'index' => $index];
        }
        usort($ranked, fn ($a, $b) => ($b['score'] <=> $a['score']) ?: ($a['index'] <=> $b['index']));
        $result = [];
        if ($includeLocal) {
            foreach ($ranked as $entry) {
                if ($entry['place']['local']) {
                    $result[] = $entry['place'];
                    break;
                }
            }
        }
        foreach (array_keys($categories) as $category) {
            if (count($result) >= $count) {
                break;
            }
            if (in_array($category, array_column($result, 'category'), true)) {
                continue;
            }
            foreach ($ranked as $entry) {
                if (! $entry['place']['local'] && $entry['place']['category'] === $category) {
                    $result[] = $entry['place'];
                    break;
                }
            }
        }
        foreach ($ranked as $entry) {
            if (count($result) >= $count) {
                break;
            }
            if (! $entry['place']['local'] && ! in_array($entry['place']['id'], array_column($result, 'id'), true)) {
                $result[] = $entry['place'];
            }
        }

        return $result;
    }

    public static function unmatched(array $catalog, array $requested, array $ids): array
    {
        $selected = array_values(array_filter($catalog, fn ($p) => in_array($p['id'], $ids, true)));
        $selectedNames = array_map(fn ($p) => self::plain($p['name']), $selected);
        $unmatched = [];
        $seen = [];
        foreach ($requested as $request) {
            $name = self::plain($request);
            if (in_array($name, $seen, true)) {
                continue;
            }
            $seen[] = $name;
            if (in_array($name, $selectedNames, true)) {
                $selected = array_values(array_filter($selected, fn ($p) => self::plain($p['name']) !== $name));

                continue;
            }
            $exact = array_values(array_filter($selected, fn ($p) => self::plain($p['name']) === $name));
            $match = $exact[0] ?? (self::rankedSelection($selected, $request, 1, true)[0] ?? null);
            if (! $match) {
                $unmatched[] = $request;
            } else {
                $selected = array_values(array_filter($selected, fn ($p) => $p['id'] !== $match['id']));
            }
        }

        return $unmatched;
    }

    private static function hasPhrase(string $text, string $phrase): bool
    {
        return str_contains(" $text ", " $phrase ");
    }
}
