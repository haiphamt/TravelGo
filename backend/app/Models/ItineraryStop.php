<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ItineraryStop extends Model
{
    public $timestamps = false;

    protected $guarded = [];

    protected function casts(): array
    {
        return ['snapshot' => 'array', 'estimated_cost' => 'integer'];
    }
}
