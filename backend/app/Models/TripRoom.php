<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class TripRoom extends Model
{
    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['result' => 'array', 'itinerary' => 'array', 'revision' => 'integer'];
    }
}
