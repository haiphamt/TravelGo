<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $accounts = [
            'travelgo-demo-1@example.invalid' => 'TravelGo Demo – Minh họa 1',
            'travelgo-demo-2@example.invalid' => 'TravelGo Demo – Minh họa 2',
        ];

        foreach ($accounts as $email => $name) {
            User::query()->firstOrCreate(
                ['email' => $email],
                ['name' => $name, 'password' => Str::random(48)],
            );
        }
    }
}
