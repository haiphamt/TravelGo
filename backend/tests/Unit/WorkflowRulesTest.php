<?php

namespace Tests\Unit;

use App\Services\Moderation\WorkflowRules;
use Carbon\CarbonImmutable;
use InvalidArgumentException;
use PHPUnit\Framework\TestCase;

class WorkflowRulesTest extends TestCase
{
    public function test_terminal_states_cannot_be_approved_and_only_claims_can_be_revoked(): void
    {
        foreach (['approved', 'rejected', 'withdrawn', 'revoked', 'needs-info'] as $status) {
            $this->assertFalse(WorkflowRules::transition('update', $status, 'approved'));
        }
        $this->assertTrue(WorkflowRules::transition('claim', 'approved', 'revoked'));
        $this->assertFalse(WorkflowRules::transition('update', 'approved', 'revoked'));
        $this->assertTrue(WorkflowRules::transition('new', 'needs-info', 'pending'));
        $this->assertFalse(WorkflowRules::transition('new', 'pending', 'pending'));
    }

    public function test_wall_time_is_vietnam_time_and_explicit_offsets_are_preserved(): void
    {
        $this->assertSame('2026-11-15T01:30:00.000000Z', WorkflowRules::date('2026-11-15T08:30'));
        $this->assertSame('2026-11-15T01:30:00.000000Z', WorkflowRules::date('2026-11-15T08:30:00+07:00'));
        $this->assertSame('2026-11-15T08:30:00.000000Z', WorkflowRules::date('2026-11-15T08:30:00Z'));
    }

    public function test_temporary_change_is_active_at_start_and_inactive_at_end(): void
    {
        $payload = ['effectiveFrom' => '2026-11-15T02:00:00.000000Z', 'effectiveUntil' => '2026-11-15T03:00:00.000000Z'];
        $approved = '2026-11-15T01:00:00.000000Z';
        $this->assertFalse(WorkflowRules::active($payload, $approved, CarbonImmutable::parse('2026-11-15T01:59:59Z')));
        $this->assertTrue(WorkflowRules::active($payload, $approved, CarbonImmutable::parse('2026-11-15T02:00:00Z')));
        $this->assertFalse(WorkflowRules::active($payload, $approved, CarbonImmutable::parse('2026-11-15T03:00:00Z')));
    }

    public function test_impossible_calendar_dates_are_rejected(): void
    {
        $this->expectException(InvalidArgumentException::class);
        WorkflowRules::date('2026-02-30T08:00');
    }
}
