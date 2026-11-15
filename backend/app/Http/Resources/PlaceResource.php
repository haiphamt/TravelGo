<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class PlaceResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->public_id,
            'name' => $this->name,
            'city' => $this->city,
            'category' => $this->category,
            'local' => $this->local,
            'area' => $this->area,
            'sourceDistrict' => $this->source_district,
            'price' => $this->price,
            'hours' => $this->hours,
            'description' => $this->description,
            'lat' => $this->lat,
            'lng' => $this->lng,
            'image' => $this->image,
            'images' => $this->images ?? [],
            'products' => $this->products ?? [],
            'facets' => $this->facets ?? [],
            'mobile' => $this->mobile,
            'photoCredit' => $this->photo_credit,
            'photoSource' => $this->photo_source,
            'localProfile' => $this->local_profile,
            'sourceUrl' => $this->source_url,
            'sourceLabel' => $this->source_label,
            'sourceLicense' => $this->source_license,
            'sourceUpdatedAt' => $this->source_updated_at?->toISOString(),
            'updated' => $this->data_updated_at?->toISOString(),
            'referenceOnly' => $this->reference_only,
            'reviewCount' => (int) ($this->public_review_count ?? 0),
            'rating' => $this->public_rating === null ? null : round((float) $this->public_rating, 2),
        ];
    }
}
