<?php

namespace App\Http\Controllers;

use App\Services\VpsMetricsService;
use Illuminate\Http\JsonResponse;

class VpsMetricsController extends Controller
{
    public function __construct(private readonly VpsMetricsService $service) {}

    public function index(): JsonResponse
    {
        return response()->json([
            'data' => $this->service->getLastHour(),
            'latest' => $this->service->getLatest(),
        ]);
    }
}
