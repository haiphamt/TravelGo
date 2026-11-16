<?php

namespace App\Http\Controllers;

use App\Services\ItinerarySuggestionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ItinerarySuggestionController extends Controller
{
    public function store(Request $request, ItinerarySuggestionService $service): JsonResponse
    {
        $data = $request->validate([
            'needs' => ['present', 'nullable', 'string', 'max:500'],
            'area' => ['nullable', 'string', 'max:120'],
            'count' => ['required', 'integer', 'min:1', 'max:5'],
            'includeLocal' => ['required', 'boolean'],
            'requested' => ['sometimes', 'array', 'list', 'max:5'],
            'requested.*' => ['required', 'string', 'max:120'],
            'startDate' => ['required', 'date_format:Y-m-d'],
            'endDate' => ['required', 'date_format:Y-m-d', 'after_or_equal:startDate'],
        ]);
        if (! trim($data['needs'] ?? '') && empty($data['requested'])) {
            return response()->json(['message' => 'Nhập sở thích hoặc điểm muốn ghé.'], 422);
        }

        return response()->json(['data' => $service->preview($data)]);
    }
}
