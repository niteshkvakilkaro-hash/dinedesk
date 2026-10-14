<?php

namespace App\Modules\Crm\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Modules\Crm\Models\Feedback;
use App\Modules\Loyalty\Models\LoyaltyEntry;
use App\Modules\Ordering\Models\Customer;
use App\Modules\Ordering\Models\Order;
use App\Modules\Reservations\Models\Reservation;
use App\Support\ApiException;
use App\Support\Phone;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/** Dashboard → Customers (CRM) and Feedback. */
class CustomersController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $data = $request->validate([
            'q' => ['nullable', 'string', 'max:60'],
            'tag' => ['nullable', 'string', 'max:30'],
            'sort' => ['nullable', Rule::in(['recent', 'spend', 'visits', 'points', 'name'])],
            'opted_in' => ['nullable', 'boolean'],
            'page' => ['nullable', 'integer', 'min:1'],
        ]);
        $q = trim((string) ($data['q'] ?? ''));
        $digits = preg_replace('/\D+/', '', $q);
        $page = Customer::query()
            ->when($q !== '', fn ($w) => $w->where(fn ($x) => $x->where('name', 'like', "%{$q}%")->orWhere('email', 'like', "%{$q}%")
                ->when(strlen($digits) >= 4, fn ($y) => $y->orWhere('phone', 'like', "%{$digits}%"))))
            ->when(! empty($data['tag']), fn ($w) => $w->whereJsonContains('tags', $data['tag']))
            ->when(isset($data['opted_in']), fn ($w) => $w->where('marketing_opt_in', (bool) $data['opted_in']))
            ->when(($data['sort'] ?? 'recent') === 'spend', fn ($w) => $w->orderByDesc('total_spent'))
            ->when(($data['sort'] ?? 'recent') === 'visits', fn ($w) => $w->orderByDesc('visits'))
            ->when(($data['sort'] ?? 'recent') === 'points', fn ($w) => $w->orderByDesc('loyalty_points'))
            ->when(($data['sort'] ?? 'recent') === 'name', fn ($w) => $w->orderBy('name'))
            ->orderByDesc('last_order_at')->orderByDesc('id')
            ->paginate(30);

        return $this->ok($page->getCollection()->map(fn (Customer $c) => $this->row($c))->values(), null, [
            'current_page' => $page->currentPage(), 'last_page' => $page->lastPage(), 'total' => $page->total(),
            'tags' => Customer::whereNotNull('tags')->pluck('tags')->flatten()->unique()->sort()->values(),
            'opted_in' => Customer::where('marketing_opt_in', true)->count(),
        ]);
    }

    public function show(int $id): JsonResponse
    {
        $c = Customer::findOrFail($id);

        return $this->ok($this->row($c) + [
            'notes' => $c->notes,
            'birthday' => $c->birthday?->format('Y-m-d'),
            'anniversary' => $c->anniversary?->format('Y-m-d'),
            'dates_opt_in' => $c->dates_opt_in,
            'marketing_opt_in_at' => $c->marketing_opt_in_at?->toIso8601String(),
            'orders' => Order::where('customer_id', $c->id)->orderByDesc('id')->limit(30)->get()
                ->map(fn ($o) => ['id' => $o->id, 'number' => $o->number, 'type' => $o->type, 'status' => $o->status, 'total' => $o->total, 'placed_at' => $o->placed_at->toIso8601String()])->values(),
            'bookings' => Reservation::where('customer_id', $c->id)->orderByDesc('starts_at')->limit(20)->get()
                ->map(fn ($r) => ['code' => $r->code, 'date' => $r->date->format('Y-m-d'), 'time' => $r->time, 'party_size' => $r->party_size, 'status' => $r->status])->values(),
            'points' => LoyaltyEntry::where('customer_id', $c->id)->orderByDesc('id')->limit(30)->get()
                ->map(fn ($e) => ['type' => $e->type, 'points' => $e->points, 'balance_after' => $e->balance_after, 'note' => $e->note, 'at' => $e->created_at->toIso8601String()])->values(),
            'feedback' => Feedback::where('customer_id', $c->id)->orderByDesc('id')->limit(10)->get()
                ->map(fn ($f) => ['rating' => $f->rating, 'comment' => $f->comment, 'at' => $f->created_at->toIso8601String()])->values(),
        ]);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $c = Customer::findOrFail($id);
        $data = $request->validate([
            'name' => ['sometimes', 'string', 'min:2', 'max:120'],
            'email' => ['nullable', 'email:rfc', 'max:160'],
            'tags' => ['nullable', 'array', 'max:12'],
            'tags.*' => ['string', 'max:30'],
            'notes' => ['nullable', 'string', 'max:500'],
            'birthday' => ['nullable', 'date', 'before:today'],
            'anniversary' => ['nullable', 'date', 'before_or_equal:today'],
            'dates_opt_in' => ['boolean'],
            'marketing_opt_in' => ['boolean'],
        ]);
        if (isset($data['tags'])) {
            $data['tags'] = array_values(array_unique(array_filter(array_map(fn ($t) => Str::lower(trim(strip_tags($t))), $data['tags']))));
        }
        if (isset($data['notes'])) {
            $data['notes'] = strip_tags($data['notes']);
        }
        // Dates are kept only with the guest's yes.
        if (array_key_exists('dates_opt_in', $data) && ! $data['dates_opt_in']) {
            $data['birthday'] = null;
            $data['anniversary'] = null;
        }
        // Only the guest can agree to offers (at checkout); staff can only switch them off.
        if (! empty($data['marketing_opt_in']) && ! $c->marketing_opt_in) {
            unset($data['marketing_opt_in']);
        }
        $c->update($data);

        return $this->show($c->id);
    }

    /** For the POS: a guest by mobile number (points to spend). */
    public function lookup(Request $request): JsonResponse
    {
        $phone = Phone::normalize((string) $request->validate(['phone' => ['required', 'string', 'max:20']])['phone']);
        $c = Customer::where('phone', $phone)->first();

        return $this->ok($c ? ['id' => $c->id, 'name' => $c->name, 'phone' => $c->phone, 'loyalty_points' => $c->loyalty_points, 'visits' => $c->visits] : null);
    }

    // ---------- Feedback ----------

    public function feedback(Request $request): JsonResponse
    {
        $rating = $request->validate(['rating' => ['nullable', 'integer', 'min:1', 'max:5']])['rating'] ?? null;
        $rows = Feedback::with('order:id,number')->when($rating, fn ($q) => $q->where('rating', $rating))->orderByDesc('id')->limit(200)->get();
        $all = Feedback::query();

        return $this->ok([
            'items' => $rows->map(fn (Feedback $f) => $f->only(['id', 'rating', 'food', 'service', 'comment', 'name', 'consent_public', 'is_published', 'reply']) + [
                'order_number' => $f->order?->number, 'customer_id' => $f->customer_id, 'created_at' => $f->created_at->toIso8601String(),
            ])->values(),
            'summary' => [
                'count' => (clone $all)->count(),
                'average' => ($n = (clone $all)->count()) ? round((float) (clone $all)->avg('rating'), 2) : null,
                'by_rating' => (clone $all)->selectRaw('rating, COUNT(*) as n')->groupBy('rating')->pluck('n', 'rating'),
                'published' => (clone $all)->where('is_published', true)->count(),
            ],
        ]);
    }

    public function updateFeedback(Request $request, int $id): JsonResponse
    {
        $f = Feedback::findOrFail($id);
        $data = $request->validate(['is_published' => ['sometimes', 'boolean'], 'reply' => ['nullable', 'string', 'max:600']]);
        if (! empty($data['is_published']) && ! $f->consent_public) {
            throw new ApiException('This guest did not agree to show their feedback publicly.', 422, 'no_consent');
        }
        if (array_key_exists('reply', $data)) {
            $data['reply'] = $data['reply'] ? strip_tags($data['reply']) : null;
        }
        $f->update($data);

        return $this->ok($f->only(['id', 'is_published', 'reply']), 'Saved.');
    }

    private function row(Customer $c): array
    {
        return [
            'id' => $c->id, 'name' => $c->name, 'phone' => $c->phone, 'email' => $c->email,
            'orders_count' => $c->orders_count, 'visits' => $c->visits, 'total_spent' => $c->total_spent,
            'loyalty_points' => $c->loyalty_points, 'tags' => $c->tags ?? [], 'marketing_opt_in' => $c->marketing_opt_in,
            'last_order_at' => $c->last_order_at?->toIso8601String(), 'created_at' => $c->created_at->toIso8601String(),
        ];
    }
}
