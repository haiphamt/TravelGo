<?php

namespace App\Http\Controllers;

use App\Services\Rooms\RoomRules;
use App\Services\Rooms\RoomService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class TripRoomController extends Controller
{
    public function __construct(private readonly RoomService $rooms) {}

    public function index(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->rooms->rooms($request->user())]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'title' => ['required', 'string', 'max:80'],
            'name' => ['sometimes', 'required', 'string', 'max:40'],
            'date' => ['present', 'nullable', 'date_format:Y-m-d'],
            'desiredStops' => ['required', 'integer', 'between:1,'.RoomRules::STOP_LIMIT],
        ]);

        return response()->json(['data' => $this->rooms->create($request->user(), $data)], 201);
    }

    public function join(Request $request): JsonResponse
    {
        $data = $request->validate([
            'code' => ['required', 'string', 'regex:/^[A-Fa-f0-9]{8}$/'],
            'name' => ['sometimes', 'required', 'string', 'max:40'],
        ]);

        return response()->json(['data' => $this->rooms->join(strtoupper($data['code']), $request->user(), $data)]);
    }

    public function show(Request $request, string $code): JsonResponse
    {
        return response()->json(['data' => $this->rooms->show($code, $request->user())]);
    }

    public function suggest(Request $request, string $code): JsonResponse
    {
        $data = $request->validate(['placeId' => ['required', 'string', 'max:80']]);

        return response()->json(['data' => $this->rooms->suggest($code, $request->user(), $data['placeId'])]);
    }

    public function removeSuggestion(Request $request, string $code): JsonResponse
    {
        $data = $request->validate(['placeId' => ['required', 'string', 'max:80']]);

        return response()->json(['data' => $this->rooms->removeSuggestion($code, $request->user(), $data['placeId'])]);
    }

    public function openVoting(Request $request, string $code): JsonResponse
    {
        return response()->json(['data' => $this->rooms->openVoting($code, $request->user())]);
    }

    public function vote(Request $request, string $code): JsonResponse
    {
        $data = $request->validate([
            'placeIds' => ['present', 'array', 'list', 'max:'.RoomRules::PLACE_LIMIT],
            'placeIds.*' => ['required', 'string', 'max:80', 'distinct:strict'],
        ]);

        return response()->json(['data' => $this->rooms->vote($code, $request->user(), $data['placeIds'])]);
    }

    public function finalize(Request $request, string $code): JsonResponse
    {
        $data = $request->validate([
            'placeIds' => ['required', 'array', 'list', 'min:1', 'max:'.RoomRules::STOP_LIMIT],
            'placeIds.*' => ['required', 'string', 'max:80', 'distinct:strict'],
        ]);

        return response()->json(['data' => $this->rooms->finalize($code, $request->user(), $data['placeIds'])]);
    }

    public function itinerary(Request $request, string $code): JsonResponse
    {
        $data = $request->validate([
            'revision' => ['required', 'integer', 'min:1'],
            'stops' => ['required', 'array', 'list', 'min:1', 'max:'.RoomRules::STOP_LIMIT],
            'stops.*' => ['required', 'array:placeId,time,refreshSnapshot,keptRevision'],
            'stops.*.placeId' => ['required', 'string', 'max:80', 'distinct:strict'],
            'stops.*.time' => ['required', 'string', 'date_format:H:i'],
            'stops.*.refreshSnapshot' => ['sometimes', 'boolean'],
            'stops.*.keptRevision' => ['sometimes', 'string', 'max:200'],
        ]);

        return response()->json(['data' => $this->rooms->itinerary($code, $request->user(), $data)]);
    }
}
