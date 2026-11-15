<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ReviewResource extends JsonResource
{
    private bool $includeHiddenPhotos = false;

    public function withHiddenPhotos(): static
    {
        $this->includeHiddenPhotos = true;

        return $this;
    }

    public function toArray(Request $request): array
    {
        $owner = $this->includeHiddenPhotos && (string) $request->user()?->id === (string) $this->user_id;
        $photos = $this->photos->filter(fn ($photo) => $owner || $photo->hidden_at === null)->values();

        return [
            'id' => (string) $this->id,
            'placeId' => $this->place->public_id,
            'author' => ['id' => (string) $this->user_id, 'name' => $this->user->name],
            'rating' => $this->rating,
            'text' => $this->text,
            'visitedOn' => $this->visited_on?->format('Y-m-d'),
            'photos' => $photos->map(fn ($photo) => '/api/review-photos/'.$photo->id)->all(),
            'photoIds' => $photos->map(fn ($photo) => (string) $photo->id)->all(),
            'updatedAt' => $this->updated_at->toISOString(),
            'hidden' => $this->hidden_at !== null,
            // Owner replies are supplied by Task 5 after its contract is integrated.
            'reply' => null,
        ];
    }
}
