<?php

namespace App\Http\Controllers;

use App\Http\Requests\SaveItineraryRequest;
use App\Models\Itinerary;
use App\Services\ItineraryService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ItineraryController extends Controller
{
    public function __construct(private ItineraryService $service) {}

    public function index(Request $request): JsonResponse
    {
        $trips = Itinerary::query()->where('user_id', $request->user()->id)->orderByDesc('updated_at')->orderBy('id')->get();

        return response()->json(['data' => $trips->map(fn ($trip) => $this->service->payload($trip))]);
    }

    public function show(Request $request, string $id): JsonResponse
    {
        return response()->json(['data' => $this->service->payload($this->service->owned($request->user()->id, $id))]);
    }

    public function store(SaveItineraryRequest $request): JsonResponse
    {
        $trip = $this->service->save($request->user()->id, $request->validated());

        return response()->json(['data' => $this->service->payload($trip)], 201);
    }

    public function update(SaveItineraryRequest $request, string $id): JsonResponse
    {
        $trip = $this->service->save($request->user()->id, $request->validated(), $id);

        return response()->json(['data' => $this->service->payload($trip)]);
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        $this->service->owned($request->user()->id, $id)->delete();

        return response()->json(null, 204);
    }
}
