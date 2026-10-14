<?php

namespace App\Modules\Notify\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Modules\Tenancy\Support\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Notifications\DatabaseNotification;

/**
 * In-app alerts the dashboard lists for the signed-in person in this business (their own
 * unread database notifications of the kinds below), each written there in the reader's
 * language from its plain values. Orders, bookings and stock have their own screens and
 * sounds, so they are not repeated here.
 */
class InAppAlertController extends Controller
{
    /** Kinds of database notification the dashboard shows as alerts. */
    public const KINDS = ['referral.reward'];

    public function __construct(private readonly TenantContext $context) {}

    public function index(Request $request): JsonResponse
    {
        $rows = $this->unread($request)->latest()->limit(10)->get();

        return $this->ok($rows->map(fn (DatabaseNotification $n) => [
            'id' => $n->id,
            'kind' => $n->data['kind'],
            'data' => array_diff_key($n->data, array_flip(['kind', 'tenant_id'])),
            'created_at' => $n->created_at?->toIso8601String(),
        ])->values());
    }

    /** Dismissed: it is not shown again. */
    public function read(Request $request, string $id): JsonResponse
    {
        $this->unread($request)->whereKey($id)->update(['read_at' => now()]);

        return $this->ok(null);
    }

    private function unread(Request $request)
    {
        return $request->user()->unreadNotifications()
            ->where('data->tenant_id', $this->context->id())
            ->whereIn('data->kind', self::KINDS);
    }
}
