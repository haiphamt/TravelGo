<?php

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
    public function createApplication()
    {
        $app = parent::createApplication();
        // Test-only copies of the dependent PRs. Never register these paths in production.
        foreach (glob(__DIR__.'/Fixtures/migrations/*.php') as $fixture) {
            if (! is_file($app->databasePath('migrations/'.basename($fixture)))) {
                $app->make('migrator')->path($fixture);
            }
        }

        return $app;
    }
}
