<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Place extends Model
{
    use HasFactory;

    protected $guarded = [];

    protected $dateFormat = 'Y-m-d H:i:s.u';

    protected function casts(): array
    {
        return [
            'local' => 'boolean',
            'price' => 'float',
            'lat' => 'float',
            'lng' => 'float',
            'images' => 'array',
            'products' => 'array',
            'facets' => 'array',
            'mobile' => 'boolean',
            'photo_source' => 'array',
            'local_profile' => 'array',
            'source_metadata' => 'array',
            'reference_only' => 'boolean',
            'source_updated_at' => 'immutable_datetime',
            'data_updated_at' => 'immutable_datetime',
            'imported_at' => 'immutable_datetime',
        ];
    }

    public function reviews(): HasMany
    {
        return $this->hasMany(Review::class);
    }

    public function favorites(): HasMany
    {
        return $this->hasMany(Favorite::class);
    }

    public function scopeWithPublicReviewSummary(Builder $query): Builder
    {
        return $query
            ->withCount(['reviews as public_review_count' => fn (Builder $reviews) => $reviews->whereNull('hidden_at')])
            ->withAvg(['reviews as public_rating' => fn (Builder $reviews) => $reviews->whereNull('hidden_at')], 'rating');
    }
}
