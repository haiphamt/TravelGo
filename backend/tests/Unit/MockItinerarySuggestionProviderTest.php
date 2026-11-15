<?php

namespace Tests\Unit;

use App\Services\MockItinerarySuggestionProvider;
use PHPUnit\Framework\TestCase;

class MockItinerarySuggestionProviderTest extends TestCase
{
    public function test_suggestions_balance_requested_categories_and_match_product_keywords(): void
    {
        $catalog = [
            ['id' => 'c1', 'name' => 'Demo One', 'area' => 'Quận 1', 'category' => 'coffee', 'local' => false, 'products' => ['cà phê']],
            ['id' => 'c2', 'name' => 'Demo Two', 'area' => 'Quận 1', 'category' => 'coffee', 'local' => false, 'products' => []],
            ['id' => 'n1', 'name' => 'Demo Park', 'area' => 'Quận 1', 'category' => 'nature', 'local' => false, 'products' => []],
            ['id' => 'f1', 'name' => 'Demo Food', 'area' => 'Quận 1', 'category' => 'food', 'local' => false, 'products' => ['bánh cam']],
        ];
        $provider = new MockItinerarySuggestionProvider;
        $this->assertSame(['c1', 'n1'], $provider->suggest($catalog, ['needs' => 'cà phê và đi dạo công viên', 'count' => 2, 'includeLocal' => false]));
        $this->assertSame(['f1'], $provider->suggest($catalog, ['needs' => 'Tôi muốn tìm bánh cam', 'count' => 2, 'includeLocal' => false]));
        $ids = $provider->suggest($catalog, ['needs' => '', 'count' => 2, 'includeLocal' => false, 'requested' => ['công viên', 'không có điểm này']]);
        $this->assertSame(['n1'], $ids);
        $this->assertSame(['không có điểm này'], MockItinerarySuggestionProvider::unmatched($catalog, ['công viên', 'không có điểm này'], $ids));
        $this->assertSame([], MockItinerarySuggestionProvider::unmatched($catalog, ['cà phê', 'Demo One'], ['c1']));
    }

    public function test_mock_deduplicates_requested_places_and_uses_at_most_one_local(): void
    {
        $catalog = [
            ['id' => 'a', 'name' => 'Cà phê Demo', 'area' => '', 'category' => 'coffee', 'local' => true],
            ['id' => 'b', 'name' => 'Demo B', 'area' => '', 'category' => 'coffee', 'local' => true],
            ['id' => 'c', 'name' => 'Demo C', 'area' => '', 'category' => 'coffee', 'local' => false],
        ];
        $result = (new MockItinerarySuggestionProvider)->suggest($catalog, ['needs' => 'cà phê', 'count' => 3, 'requested' => ['Cà phê Demo', 'Cà phê Demo']]);
        $this->assertSame(['a', 'c'], $result);
    }
}
