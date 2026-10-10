<?php

namespace App\Modules\Crm\Services;

use App\Modules\Crm\Models\Feedback;
use App\Modules\Ordering\Models\Order;
use App\Support\ApiException;
use Illuminate\Support\Str;

/**
 * Post-order feedback. A guest can rate a completed order once. It appears on the
 * website only if the guest agreed and the owner publishes it (first name + initial).
 */
class FeedbackService
{
    public function submit(Order $order, array $data): Feedback
    {
        if ($order->status !== 'completed') {
            throw new ApiException('You can rate your order once it is complete.', 422, 'not_completed');
        }
        if (Feedback::where('order_id', $order->id)->exists()) {
            throw new ApiException('Thanks, we already have your feedback for this order.', 422, 'already_rated');
        }

        return Feedback::create([
            'order_id' => $order->id,
            'customer_id' => $order->customer_id,
            'rating' => (int) $data['rating'],
            'food' => $data['food'] ?? null,
            'service' => $data['service'] ?? null,
            'comment' => isset($data['comment']) && trim($data['comment']) !== '' ? strip_tags(trim($data['comment'])) : null,
            'name' => self::shortName($order->customer_name),
            'consent_public' => (bool) ($data['consent_public'] ?? false),
            'created_at' => now(),
        ]);
    }

    /** "Asha Verma" → "Asha V." (walk-in / table names are not shown). */
    public static function shortName(?string $name): ?string
    {
        $name = trim((string) $name);
        if ($name === '' || Str::startsWith($name, ['Table ', 'Walk-in'])) {
            return null;
        }
        $parts = preg_split('/\s+/', $name);

        return count($parts) > 1 ? $parts[0].' '.mb_strtoupper(mb_substr(end($parts), 0, 1)).'.' : $parts[0];
    }

    /** Published reviews for the website (real, consented, approved). */
    public function published(int $limit = 6): array
    {
        $q = Feedback::where('is_published', true)->where('consent_public', true);
        $count = (clone $q)->count();

        return [
            'count' => $count,
            'average' => $count ? round((float) (clone $q)->avg('rating'), 1) : null,
            'items' => (clone $q)->orderByDesc('created_at')->limit($limit)->get()->map(fn (Feedback $f) => [
                'name' => $f->name, 'rating' => $f->rating, 'comment' => $f->comment, 'reply' => $f->reply,
                'date' => $f->created_at->format('Y-m-d'),
            ])->values()->all(),
        ];
    }
}
