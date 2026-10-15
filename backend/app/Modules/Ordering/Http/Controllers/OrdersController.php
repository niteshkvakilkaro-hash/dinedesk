<?php

namespace App\Modules\Ordering\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Modules\Ordering\Models\Order;
use App\Modules\Ordering\Services\OrderFlow;
use App\Modules\Ordering\Services\OrderPresenter;
use App\Modules\Tenancy\Support\TenantContext;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/** Dashboard → Orders (orders.view to see, orders.manage to change). */
class OrdersController extends Controller
{
    public function __construct(
        private readonly OrderPresenter $presenter,
        private readonly TenantContext $context,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $data = $request->validate([
            'view' => ['nullable', Rule::in(['active', 'scheduled', 'completed', 'cancelled', 'all'])],
            'type' => ['nullable', Rule::in(Order::TYPES)],
            'date' => ['nullable', 'date_format:Y-m-d'],
            'search' => ['nullable', 'string', 'max:60'],
            'page' => ['nullable', 'integer', 'min:1'],
        ]);
        $tz = $this->context->require()->timezone;
        $q = Order::query()->withSum('items', 'quantity')->with('rider:id,name');

        match ($data['view'] ?? 'active') {
            // Paid online orders and all pay-later ones; unpaid online orders stay out of the kitchen's way.
            'active' => $q->whereNotIn('status', ['completed', 'cancelled'])
                ->where(fn ($w) => $w->where('payment_method', '!=', 'online')->orWhere('payment_status', 'paid'))
                ->where(fn ($w) => $w->whereNull('scheduled_for')->orWhere('scheduled_for', '<=', now()->addHours(2))),
            'scheduled' => $q->whereNotIn('status', ['completed', 'cancelled'])->where('scheduled_for', '>', now()->addHours(2)),
            'completed' => $q->where('status', 'completed'),
            'cancelled' => $q->where('status', 'cancelled'),
            default => null,
        };
        if (! empty($data['type'])) {
            $q->where('type', $data['type']);
        }
        if (! empty($data['date'])) {
            $start = CarbonImmutable::parse($data['date'], $tz)->startOfDay()->utc();
            $q->whereBetween('placed_at', [$start, $start->addDay()]);
        }
        if (! empty($data['search'])) {
            $s = trim($data['search']);
            // Phone only when the search has digits: '%%' would match every order.
            $digits = preg_replace('/\D+/', '', $s);
            $q->where(fn ($w) => $w->where('number', ltrim($s, '#'))->orWhere('customer_name', 'like', "%{$s}%")
                ->when($digits !== '', fn ($w) => $w->orWhere('customer_phone', 'like', "%{$digits}%")));
        }
        $active = ($data['view'] ?? 'active') === 'active';
        $page = $q->orderBy($active ? 'placed_at' : 'id', $active ? 'asc' : 'desc')->paginate(30);

        return $this->paginated($page, OrderRow::class, ['counts' => $this->counts()]);
    }

    public function show(int $id): JsonResponse
    {
        return $this->ok($this->presenter->forStaff(Order::with(['items', 'events'])->findOrFail($id)));
    }

    public function transition(Request $request, int $id, OrderFlow $flow): JsonResponse
    {
        $data = $request->validate([
            'status' => ['required', Rule::in(Order::STATUSES)],
            'note' => ['nullable', 'string', 'max:255'],
        ]);
        $order = $flow->transition(Order::findOrFail($id), $data['status'], $request->user(), $data['note'] ?? null);

        return $this->ok($this->presenter->forStaff($order), 'Order updated.');
    }

    /** Staff saw the guest's UPI payment arrive. */
    public function upiReceived(Request $request, int $id, OrderFlow $flow): JsonResponse
    {
        $order = $flow->confirmUpi(Order::findOrFail($id), $request->user());

        return $this->ok($this->presenter->forStaff($order->fresh(['items', 'events'])), 'Payment marked as received.');
    }

    /**
     * Polled every few seconds by the dashboard: new orders since the last id seen
     * (to play the alert sound) plus the live counts.
     */
    public function feed(Request $request): JsonResponse
    {
        $after = (int) $request->query('after', 0);
        $user = $request->user();
        $new = Order::where('id', '>', $after)
            ->where(fn ($w) => $w->where('payment_method', '!=', 'online')->orWhere('payment_status', 'paid'))
            ->orderBy('id')->limit(20)->get();
        $unread = $user->unreadNotifications()->where('data->tenant_id', $this->context->id())->count();

        return $this->ok([
            'latest_id' => (int) Order::max('id'),
            'new' => $new->map(fn ($o) => ['id' => $o->id, 'number' => $o->number, 'type' => $o->type, 'total' => $o->total, 'customer_name' => $o->customer_name])->values(),
            'counts' => $this->counts(),
            'unread' => $unread,
        ]);
    }

    public function markNotificationsRead(Request $request): JsonResponse
    {
        $request->user()->unreadNotifications()->where('data->tenant_id', $this->context->id())->update(['read_at' => now()]);

        return $this->ok(null);
    }

    private function counts(): array
    {
        $base = fn () => Order::query()->where(fn ($w) => $w->where('payment_method', '!=', 'online')->orWhere('payment_status', 'paid'));

        return [
            'pending' => $base()->where('status', 'pending')->count(),
            'in_kitchen' => $base()->whereIn('status', ['confirmed', 'preparing'])->count(),
            'ready' => $base()->whereIn('status', ['ready', 'out_for_delivery'])->count(),
            'scheduled' => $base()->whereNotIn('status', ['completed', 'cancelled'])->where('scheduled_for', '>', now()->addHours(2))->count(),
        ];
    }
}
