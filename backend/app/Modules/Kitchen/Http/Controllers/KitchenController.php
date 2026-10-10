<?php

namespace App\Modules\Kitchen\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Modules\Kitchen\Models\Kot;
use App\Modules\Kitchen\Models\KotItem;
use App\Modules\Kitchen\Services\Kitchen;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/** Kitchen Display System. */
class KitchenController extends Controller
{
    public function __construct(private readonly Kitchen $kitchen) {}

    public function index(): JsonResponse
    {
        return $this->ok($this->kitchen->board());
    }

    public function move(Request $request, int $id): JsonResponse
    {
        $data = $request->validate(['status' => ['required', Rule::in(['preparing', 'ready', 'served'])]]);

        return $this->ok($this->kitchen->present($this->kitchen->move(Kot::with('order')->findOrFail($id), $data['status'], $request->user())));
    }

    public function toggleItem(int $id): JsonResponse
    {
        $item = $this->kitchen->toggleItem(KotItem::findOrFail($id));

        return $this->ok(['id' => $item->id, 'done' => $item->done]);
    }
}
