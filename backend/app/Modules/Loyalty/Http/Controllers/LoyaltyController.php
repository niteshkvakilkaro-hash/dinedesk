<?php

namespace App\Modules\Loyalty\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Modules\Loyalty\Models\GiftCard;
use App\Modules\Loyalty\Models\GiftCardTransaction;
use App\Modules\Loyalty\Services\GiftCards;
use App\Modules\Loyalty\Services\Loyalty;
use App\Modules\Ordering\Models\Customer;
use App\Support\Phone;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/** Dashboard → Loyalty: points settings, adjustments, gift cards. */
class LoyaltyController extends Controller
{
    public function settings(Loyalty $loyalty): JsonResponse
    {
        return $this->ok([
            'settings' => $loyalty->get(),
            'members' => Customer::where('loyalty_points', '>', 0)->count(),
            'outstanding_points' => (int) Customer::sum('loyalty_points'),
        ]);
    }

    public function updateSettings(Request $request, Loyalty $loyalty): JsonResponse
    {
        $loyalty->save($request->validate(Loyalty::rules()));

        return $this->settings($loyalty);
    }

    public function adjust(Request $request, int $customerId, Loyalty $loyalty): JsonResponse
    {
        $data = $request->validate(['points' => ['required', 'integer', 'not_in:0', 'min:-100000', 'max:100000'], 'note' => ['required', 'string', 'max:200']]);
        $customer = Customer::findOrFail($customerId);
        $loyalty->adjust($customer, (int) $data['points'], strip_tags($data['note']), $request->user()->id);

        return $this->ok(['points' => $customer->fresh()->loyalty_points], 'Points updated.');
    }

    // ---------- Gift cards ----------

    public function giftCards(Request $request): JsonResponse
    {
        $q = trim((string) $request->query('q', ''));

        return $this->ok(GiftCard::when($q !== '', fn ($w) => $w->where('code', 'like', '%'.GiftCards::normalize($q).'%')->orWhere('issued_to', 'like', "%{$q}%"))
            ->orderByDesc('id')->limit(100)->get()->map(fn (GiftCard $g) => $this->card($g))->values());
    }

    public function issue(Request $request, GiftCards $cards): JsonResponse
    {
        $data = $request->validate([
            'value' => ['required', 'numeric', 'min:1', 'max:100000'],
            'mode' => ['required', Rule::in(['cash', 'upi', 'card', 'complimentary'])],
            'issued_to' => ['nullable', 'string', 'max:120'],
            'phone' => ['nullable', 'string', 'max:20'],
            'expires_on' => ['nullable', 'date', 'after:today'],
        ]);

        return $this->created($this->card($cards->issue($data, $request->user()->id)), 'Gift card created.');
    }

    public function show(int $id): JsonResponse
    {
        $g = GiftCard::findOrFail($id);

        return $this->ok($this->card($g) + [
            'transactions' => GiftCardTransaction::where('gift_card_id', $g->id)->orderBy('id')->get()
                ->map(fn ($t) => ['type' => $t->type, 'amount' => $t->amount, 'balance_after' => $t->balance_after, 'mode' => $t->mode, 'at' => $t->created_at->toIso8601String()])->values(),
        ]);
    }

    /** Check a card at the counter before taking it as payment. */
    public function lookup(Request $request, GiftCards $cards): JsonResponse
    {
        $code = (string) $request->validate(['code' => ['required', 'string', 'max:25']])['code'];

        return $this->ok($this->card($cards->find($code)));
    }

    public function void(Request $request, int $id, GiftCards $cards): JsonResponse
    {
        $data = $request->validate(['reason' => ['required', 'string', 'min:3', 'max:200']]);

        return $this->ok($this->card($cards->void(GiftCard::findOrFail($id), $data['reason'], $request->user()->id)), 'Gift card cancelled.');
    }

    private function card(GiftCard $g): array
    {
        return [
            'id' => $g->id, 'code' => $g->code, 'initial_value' => $g->initial_value, 'balance' => $g->balance,
            'issued_to' => $g->issued_to, 'phone' => $g->phone, 'status' => $g->status,
            'expires_on' => $g->expires_on?->format('Y-m-d'), 'created_at' => $g->created_at->toIso8601String(),
        ];
    }

    public static function normalizePhone(?string $p): ?string
    {
        return $p ? Phone::normalize($p) : null;
    }
}
