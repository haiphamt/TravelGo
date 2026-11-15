<?php

namespace App\Http\Controllers;

use App\Models\Favorite;
use App\Models\Place;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class FavoriteController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        return $this->listing($request);
    }

    public function store(Request $request): JsonResponse
    {
        $place = $this->place($request);
        // The database unique key also protects concurrent identical requests.
        Favorite::query()->firstOrCreate(['user_id' => $request->user()->id, 'place_id' => $place->id]);

        return $this->listing($request);
    }

    public function destroy(Request $request): JsonResponse
    {
        $place = $this->place($request);
        Favorite::query()->where('user_id', $request->user()->id)->where('place_id', $place->id)->delete();

        return $this->listing($request);
    }

    private function place(Request $request): Place
    {
        $data = $request->validate(['placeId' => ['required', 'string', 'max:80'], 'user_id' => ['prohibited'], 'userId' => ['prohibited']]);

        return Place::query()->where('public_id', $data['placeId'])->firstOrFail();
    }

    private function listing(Request $request): JsonResponse
    {
        $ids = Favorite::query()->where('user_id', $request->user()->id)
            ->join('places', 'places.id', '=', 'favorites.place_id')
            ->orderBy('favorites.id')->pluck('places.public_id');

        return response()->json(['data' => $ids])->header('Cache-Control', 'private, no-store');
    }
}
