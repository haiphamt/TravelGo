<?php

namespace App\Services\Rooms;

final class RoomRules
{
    public const MEMBER_LIMIT = 12;

    public const PLACE_LIMIT = 12;

    public const STOP_LIMIT = 5;

    public static function inviteCode(): string
    {
        return strtoupper(bin2hex(random_bytes(4)));
    }

    public static function defaultTime(int $index): string
    {
        return sprintf('%02d:00', 8 + 2 * $index);
    }
}
