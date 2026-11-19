<?php

namespace App\Modules\Platform\Support;

use App\Modules\Plans\Models\Plan;
use App\Support\Ai\Ai;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * The NikoBite assistant on the website and in the dashboard. With an AI key it answers in the
 * visitor's own language from the facts below only; without one (or if the AI fails) it answers
 * from a small keyword list. Either way it hands over to WhatsApp for anything it can't settle.
 */
class SupportBot
{
    public function __construct(private readonly Ai $ai) {}

    /**
     * @param  list<array{role: string, text: string}>  $messages  the conversation so far, the visitor's last message included
     * @return array{reply: string, handoff: bool}
     */
    public function reply(array $messages): array
    {
        if ($this->ai->enabled()) {
            try {
                $answer = $this->ai->json($this->system(), [['type' => 'text', 'text' => $this->transcript($messages)]], [
                    'type' => 'object',
                    'properties' => [
                        'reply' => ['type' => 'string'],
                        'handoff' => ['type' => 'boolean'],
                    ],
                    'required' => ['reply', 'handoff'],
                    'additionalProperties' => false,
                ], 4000);
                $reply = trim((string) ($answer['reply'] ?? ''));
                if ($reply !== '') {
                    return ['reply' => mb_substr($reply, 0, 1200), 'handoff' => (bool) ($answer['handoff'] ?? false)];
                }
            } catch (Throwable $e) {
                Log::info('Support bot fell back to keyword answers', ['message' => $e->getMessage()]);
            }
        }

        return $this->keywordReply((string) (end($messages)['text'] ?? ''));
    }

    /** Facts the bot may use: plans and prices come from the database, so they never go stale. */
    public function facts(): string
    {
        $plans = Plan::where('is_active', true)->orderBy('sort_order')->get()->map(function (Plan $p) {
            $price = $p->price_monthly !== null ? '₹'.number_format((float) $p->price_monthly).'/month'.($p->price_yearly !== null ? ' or ₹'.number_format((float) $p->price_yearly).'/year' : '') : 'price on request';

            return "- {$p->name}: {$price}. {$p->description}";
        })->implode("\n");
        $trial = (int) config('dinedesk.trial.days');
        $site = rtrim((string) config('app.url'), '/');

        return <<<TXT
        NikoBite is restaurant software for India: a restaurant website with 8 designed themes, online ordering
        (delivery and takeaway), QR table ordering, table bookings, a POS with GST bills (CGST/SGST, split
        payments), a kitchen display, inventory, loyalty and offers, reports and a hotel module (rooms, front desk).
        The website and dashboard work in 12 Indian languages. No commission per order: online payments go to the
        restaurant's own Razorpay account. Works on a phone; there is also an Android app.
        Plans:
        {$plans}
        Every new business gets a {$trial}-day free trial, no card needed. Sign up: {$site}/signup
        Try a live demo restaurant instantly (no sign-up): {$site}/demo
        See the themes: {$site}/themes
        TXT;
    }

    private function system(): string
    {
        return "You are the NikoBite assistant on the NikoBite website and dashboard. Help restaurant, cafe, cloud kitchen
            and hotel owners understand NikoBite and get started. Reply in the same language and script the visitor
            writes in (English, Hindi, Hinglish or another Indian language). Keep replies short: at most 3 sentences
            or a short list. Use only the facts below; never invent prices, features, discounts, customer numbers or
            promises. Suggest the live demo or the free trial when it fits. Set handoff to true when the visitor
            asks for a person, a call, a custom deal, wants to pay or set up, reports a problem with their account,
            or asks something the facts don't answer, and say a NikoBite person will help on WhatsApp.\n\nFacts:\n".$this->facts();
    }

    /** @param  list<array{role: string, text: string}>  $messages */
    private function transcript(array $messages): string
    {
        $lines = array_map(fn ($m) => ($m['role'] === 'bot' ? 'Assistant' : 'Visitor').': '.$m['text'], array_slice($messages, -12));

        return "Conversation so far (the last line is the visitor's new message):\n".implode("\n", $lines);
    }

    /** No AI: a few common questions in English and Hinglish, everything else to WhatsApp. */
    public function keywordReply(string $text): array
    {
        $t = mb_strtolower($text);
        // Whole words only ("hi" must not match "this"), in any script.
        $has = fn (array $words) => (bool) array_filter($words, fn ($w) => preg_match('/(?<![\p{L}\p{N}])'.preg_quote($w, '/').'(?![\p{L}\p{N}])/u', $t));
        $site = rtrim((string) config('app.url'), '/');

        if ($has(['price', 'pricing', 'plan', 'cost', 'charge', 'rate', 'kitna', 'kitne', 'paisa', 'fees', 'fee', 'subscription', '₹', 'rs'])) {
            $plans = Plan::where('is_active', true)->orderBy('sort_order')->get()
                ->map(fn (Plan $p) => $p->name.($p->price_monthly !== null ? ' ₹'.number_format((float) $p->price_monthly).'/month' : ''))->implode(', ');

            return ['reply' => "Plans: {$plans}. Every plan starts with a ".(int) config('dinedesk.trial.days')."-day free trial, no card needed. Full details: {$site}/pricing", 'handoff' => false];
        }
        if ($has(['demo', 'try', 'dekh', 'sample', 'example', 'test'])) {
            return ['reply' => "You can try a full demo restaurant right now, no sign-up: {$site}/demo — it has a menu with photos, website, POS and GST bills.", 'handoff' => false];
        }
        if ($has(['trial', 'free', 'muft', 'signup', 'sign up', 'register', 'account', 'start', 'shuru'])) {
            return ['reply' => 'Start free for '.(int) config('dinedesk.trial.days')." days, no card needed: {$site}/signup — you can set up your website and menu in an afternoon.", 'handoff' => false];
        }
        if ($has(['feature', 'pos', 'bill', 'gst', 'qr', 'website', 'order', 'kitchen', 'menu', 'booking', 'hotel', 'inventory', 'kya kya', 'kya milega'])) {
            return ['reply' => "NikoBite gives you a restaurant website, online ordering, QR table ordering, bookings, POS with GST bills, kitchen display, inventory and reports — in 12 Indian languages, with no commission per order. See it live: {$site}/demo", 'handoff' => false];
        }
        if ($has(['hi', 'hello', 'hey', 'namaste', 'hii'])) {
            return ['reply' => 'Namaste! I can tell you about NikoBite plans, features and the free live demo. What would you like to know?', 'handoff' => false];
        }

        return ['reply' => "Thanks! A NikoBite person will help you with this on WhatsApp. Meanwhile, you can try the live demo: {$site}/demo", 'handoff' => true];
    }
}
