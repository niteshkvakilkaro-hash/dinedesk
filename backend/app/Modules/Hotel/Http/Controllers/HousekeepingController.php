<?php

namespace App\Modules\Hotel\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Modules\Hotel\Models\HousekeepingLog;
use App\Modules\Hotel\Models\Room;
use App\Modules\Hotel\Services\Housekeeping;
use App\Modules\Tenancy\Support\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/** Dashboard → Hotel → Housekeeping: the room board and status changes. */
class HousekeepingController extends Controller
{
    public function __construct(private readonly Housekeeping $housekeeping, private readonly TenantContext $context) {}

    public function board(): JsonResponse
    {
        return $this->ok($this->housekeeping->board($this->context->require()->timezone));
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $data = $request->validate(['status' => ['required', Rule::in(Room::HOUSEKEEPING)], 'note' => ['nullable', 'string', 'max:200']]);
        $this->housekeeping->set(Room::findOrFail($id), $data['status'], $data['note'] ?? null, $request->user());

        return $this->ok($this->housekeeping->board($this->context->require()->timezone), 'Room updated.');
    }

    public function log(int $id): JsonResponse
    {
        $room = Room::findOrFail($id);
        $rows = HousekeepingLog::with('user:id,name')->where('room_id', $room->id)->orderByDesc('id')->limit(30)->get();

        return $this->ok($rows->map(fn (HousekeepingLog $l) => ['from' => $l->from, 'to' => $l->to, 'note' => $l->note, 'by' => $l->user?->name, 'at' => $l->created_at->toIso8601String()])->values());
    }
}
