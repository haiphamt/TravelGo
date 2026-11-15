<?php

namespace Tests\Feature;

use Tests\TestCase;

class HealthTest extends TestCase
{
    public function test_laravel_reports_that_it_is_up(): void
    {
        $this->get('/up')->assertOk();
    }
}
