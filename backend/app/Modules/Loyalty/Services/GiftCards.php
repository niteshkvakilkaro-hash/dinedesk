<?php

namespace App\Modules\Loyalty\Services;

use App\Modules\Audit\Models\AuditLog;
use App\Modules\Loyalty\Models\GiftCard;
use App\Modules\Loyalty\Models\GiftCardTransaction;
use App\Modules\Ordering\Support\Money;
use App\Support\ApiException;
use App\Support\Phone;
use Illuminate\Support\Facades\DB;

/**
 * Gift cards / vouchers: sold or given at the restaurant, spent as a payment on a bill
 * (any number of times until the balance runs out). The sale is recorded with how it
 * was paid for, so the day-end cash count includes cash taken for gift cards.
 */
class GiftCards
{
    private const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

    public function issue(array $data, int $userId): GiftCard
    {
        return DB::transaction(function () use ($data, $userId) {
            $value = Money::toPaise($data['value']);
            $card = GiftCard::create([
                'code' => $this->newCode(),
                'initial_value' => Money::toRupees($value),
                'balance' => Money::toRupees($value),
                'issued_to' => isset($data['issued_to']) ? strip_tags($data['issued_to']) : null,
                'phone' => ! empty($data['phone']) ? Phone::normalize($data['phone']) : null,
                'expires_on' => $data['expires_on'] ?? null,
                'issued_by' => $userId,
            ]);
            $this->log($card, 'issue', $value, $data['mode'] ?? null, null, $userId);
            AuditLog::record('gift_card.issued', $card, ['value' => $card->initial_value, 'mode' => $data['mode'] ?? null]);

            return $card;
        });
    }

    /** A usable card for a code (active, not expired, with balance). */
    public function find(string $code): GiftCard
    {
        $card = GiftCard::where('code', self::normalize($code))->first();
        if (! $card || $card->status !== 'active') {
            throw new ApiException('This gift card is not valid.', 422, 'gift_card_invalid');
        }
        if ($card->expires_on && $card->expires_on->endOfDay()->isPast()) {
            throw new ApiException('This gift card expired on '.$card->expires_on->format('j M Y').'.', 422, 'gift_card_expired');
        }
        if ((float) $card->balance <= 0) {
            throw new ApiException('This gift card has no balance left.', 422, 'gift_card_empty');
        }

        return $card;
    }

    /** Takes $paise off a card for a bill (inside the payment transaction). */
    public function redeem(string $code, int $paise, int $invoiceId, ?int $userId): GiftCard
    {
        $card = $this->find($code);
        $card = GiftCard::whereKey($card->id)->lockForUpdate()->first();
        $balance = Money::toPaise($card->balance);
        if ($paise > $balance) {
            throw new ApiException('This gift card has only ₹'.Money::toRupees($balance).' left.', 422, 'gift_card_balance');
        }
        $card->update(['balance' => Money::toRupees($balance - $paise)]);
        $this->log($card, 'redeem', -$paise, null, $invoiceId, $userId);

        return $card;
    }

    /** Bill cancelled after paying with a card: the money goes back on it. */
    public function refund(int $invoiceId): void
    {
        foreach (GiftCardTransaction::where('invoice_id', $invoiceId)->where('type', 'redeem')->get() as $t) {
            $card = GiftCard::whereKey($t->gift_card_id)->lockForUpdate()->first();
            $back = -Money::toPaise($t->amount);
            $card->update(['balance' => Money::toRupees(Money::toPaise($card->balance) + $back)]);
            $this->log($card, 'refund', $back, null, $invoiceId, null);
        }
    }

    public function void(GiftCard $card, string $reason, int $userId): GiftCard
    {
        $card->update(['status' => 'void']);
        $this->log($card, 'void', 0, null, null, $userId);
        AuditLog::record('gift_card.void', $card, ['code' => $card->code, 'balance' => $card->balance, 'reason' => $reason]);

        return $card;
    }

    public static function normalize(string $code): string
    {
        $c = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', $code));

        return implode('-', str_split($c, 4));
    }

    private function newCode(): string
    {
        do {
            $raw = '';
            for ($i = 0; $i < 16; $i++) {
                $raw .= self::ALPHABET[random_int(0, strlen(self::ALPHABET) - 1)];
            }
            $code = implode('-', str_split($raw, 4));
        } while (GiftCard::where('code', $code)->exists());

        return $code;
    }

    private function log(GiftCard $card, string $type, int $paise, ?string $mode, ?int $invoiceId, ?int $userId): void
    {
        GiftCardTransaction::create([
            'gift_card_id' => $card->id, 'type' => $type, 'amount' => Money::toRupees($paise), 'balance_after' => $card->balance,
            'mode' => $mode, 'invoice_id' => $invoiceId, 'user_id' => $userId, 'created_at' => now(),
        ]);
    }
}
