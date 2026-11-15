<?php

namespace App\Services\Moderation;

use Carbon\CarbonImmutable;
use InvalidArgumentException;

class WorkflowRules
{
    public static function transition(string $kind, string $status, string $action): bool
    {
        return match ($action) {
            'withdrawn' => in_array($status, ['pending', 'needs-info'], true),
            'pending' => $status === 'needs-info',
            'approved', 'rejected', 'needs-info' => $status === 'pending',
            'revoked' => $kind === 'claim' && $status === 'approved',
            default => false,
        };
    }

    public static function date(?string $value): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }
        // datetime-local fields are wall time in Ho Chi Minh City, never the server timezone.
        if (! preg_match('/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?(?:Z|[+-]\d{2}:\d{2})?)?$/D', $value)) {
            throw new InvalidArgumentException('Invalid effective time.');
        }
        try {
            $date = CarbonImmutable::parse($value, 'Asia/Ho_Chi_Minh');
            if ($date->format('Y-m-d') !== substr($value, 0, 10)) {
                throw new InvalidArgumentException;
            }

            return $date->utc()->toISOString();
        } catch (\Exception) {
            throw new InvalidArgumentException('Invalid effective time.');
        }
    }

    public static function active(array $payload, string $approvedAt, CarbonImmutable $now): bool
    {
        $from = max($approvedAt, $payload['effectiveFrom'] ?? $approvedAt);

        return $from <= $now->toISOString() && (! isset($payload['effectiveUntil']) || $payload['effectiveUntil'] > $now->toISOString());
    }
}
