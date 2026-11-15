<?php

namespace Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

class PlaceFactory extends Factory
{
    public function definition(): array
    {
        return [
            'public_id' => 'tg-demo-'.Str::uuid(),
            'source' => 'demo',
            'source_id' => fn (array $attributes) => $attributes['public_id'],
            'name' => 'Địa điểm kiểm thử',
            'city' => 'hcm',
            'category' => 'food',
            'local' => false,
            'reference_only' => true,
        ];
    }
}
