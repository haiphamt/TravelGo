<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Itinerary extends Model
{
    public $incrementing = false;

    protected $keyType = 'string';

    protected $guarded = [];

    protected function casts(): array
    {
        return ['budget' => 'integer', 'version' => 'integer'];
    }

    public function stops(): HasMany
    {
        return $this->hasMany(ItineraryStop::class)->orderBy('position');
    }
}
