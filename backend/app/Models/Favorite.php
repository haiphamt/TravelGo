<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Favorite extends Model
{
    protected $fillable = ['user_id', 'place_id'];

    public function place(): BelongsTo
    {
        return $this->belongsTo(Place::class);
    }
}
