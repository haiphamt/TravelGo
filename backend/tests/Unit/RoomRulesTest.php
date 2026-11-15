<?php

namespace Tests\Unit;

use App\Services\Rooms\RoomRules;
use PHPUnit\Framework\TestCase;

class RoomRulesTest extends TestCase
{
    public function test_invites_use_the_eight_hex_characters_accepted_by_the_existing_ui(): void
    {
        $codes = array_map(fn () => RoomRules::inviteCode(), range(1, 8));
        foreach ($codes as $code) {
            $this->assertMatchesRegularExpression('/^[A-F0-9]{8}$/', $code);
        }

    }

    public function test_result_times_follow_the_handed_over_ui_order(): void
    {
        $this->assertSame(['08:00', '10:00', '12:00', '14:00', '16:00'],
            array_map(RoomRules::defaultTime(...), range(0, RoomRules::STOP_LIMIT - 1)));
    }
}
