<?php

namespace App\Modules\Platform\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Modules\Platform\Models\SupportChat;
use App\Modules\Platform\Support\SupportBot;
use App\Modules\Subscriptions\Services\PlatformRazorpay;
use App\Modules\Subscriptions\Services\PlatformSettings;
use App\Support\Phone;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * The NikoBite assistant (public: website visitors; signed-in businesses are linked to their chat)
 * and the public settings the app needs before sign-in.
 */
class SupportChatController extends Controller
{
    /** What the app can offer: the support contact, which sign-in methods really work, online payments. */
    public function config(PlatformSettings $settings, PlatformRazorpay $razorpay): JsonResponse
    {
        $support = $settings->get('support');

        return $this->ok([
            'support' => ['whatsapp' => $support['whatsapp'], 'email' => $support['email'], 'chatbot' => (bool) $support['chatbot']],
            // Codes only reach a phone through a real SMS driver; in development the code is shown on screen.
            'sign_in' => ['mobile' => config('dinedesk.otp.driver') !== 'log' || ! app()->environment('production')],
            'billing' => ['online' => $razorpay->configured()],
        ]);
    }

    public function send(Request $request, SupportBot $bot, PlatformSettings $settings): JsonResponse
    {
        if ($request->filled('phone')) {
            $request->merge(['phone' => Phone::normalize($request->input('phone'))]);
        }
        $data = $request->validate([
            'chat_id' => ['nullable', 'string', 'size:26'],
            'message' => ['required', 'string', 'min:1', 'max:1000'],
            'name' => ['nullable', 'string', 'max:80'],
            'phone' => ['nullable', Phone::RULE],
            'page' => ['nullable', 'string', 'max:200'],
        ], ['phone.regex' => Phone::MESSAGE]);

        $user = $request->user('sanctum');
        $chat = ! empty($data['chat_id']) ? SupportChat::where('public_id', $data['chat_id'])->first() : null;
        // A chat belongs to whoever started it: a signed-in user can't continue someone else's.
        if ($chat && $chat->user_id && $chat->user_id !== $user?->id) {
            $chat = null;
        }
        $chat ??= new SupportChat([
            'tenant_id' => $user?->tenant_id,
            'user_id' => $user?->id,
            'ip' => $request->ip(),
            'messages' => [],
        ]);

        $messages = $chat->messages ?? [];
        if (count($messages) >= 80) {
            return $this->ok($this->payload($chat, ['reply' => 'This chat is quite long. Please continue with us on WhatsApp.', 'handoff' => true], $settings));
        }
        $messages[] = ['role' => 'visitor', 'text' => strip_tags($data['message']), 'at' => now()->toIso8601String()];

        $support = $settings->get('support');
        $answer = $support['chatbot'] ? $bot->reply($messages) : ['reply' => 'A NikoBite person will reply to you on WhatsApp.', 'handoff' => true];
        $messages[] = ['role' => 'bot', 'text' => $answer['reply'], 'at' => now()->toIso8601String()];

        $chat->fill([
            'messages' => $messages,
            'page' => $data['page'] ?? $chat->page,
            'visitor_name' => isset($data['name']) ? strip_tags($data['name']) : ($chat->visitor_name ?? $user?->name),
            'visitor_phone' => $data['phone'] ?? ($chat->visitor_phone ?? $user?->phone),
            'status' => 'new',
            'last_message_at' => now(),
        ])->save();

        return $this->ok($this->payload($chat, $answer, $settings));
    }

    private function payload(SupportChat $chat, array $answer, PlatformSettings $settings): array
    {
        $wa = $settings->get('support')['whatsapp'];

        return [
            'chat_id' => $chat->public_id,
            'reply' => $answer['reply'],
            'handoff' => $answer['handoff'],
            'whatsapp_url' => $wa ? 'https://wa.me/'.$wa.'?text='.rawurlencode('Hi NikoBite, I was chatting on your website (chat '.substr((string) $chat->public_id, -6).').') : null,
        ];
    }

    // ---------- Super admin ----------

    public function index(Request $request): JsonResponse
    {
        $data = $request->validate(['status' => ['nullable', Rule::in(SupportChat::STATUSES)]]);
        $page = SupportChat::query()->with('tenant:id,name')
            ->when($data['status'] ?? null, fn ($q, $s) => $q->where('status', $s))
            ->orderByDesc('last_message_at')->paginate(30);

        return $this->ok($page->getCollection()->map(fn (SupportChat $c) => $this->row($c)), null, [
            'current_page' => $page->currentPage(),
            'last_page' => $page->lastPage(),
            'total' => $page->total(),
            'new' => SupportChat::where('status', 'new')->count(),
        ]);
    }

    public function show(string $id): JsonResponse
    {
        $chat = SupportChat::where('public_id', $id)->firstOrFail();
        if ($chat->status === 'new') {
            $chat->update(['status' => 'seen']);
        }

        return $this->ok($this->row($chat) + ['messages' => $chat->messages]);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $chat = SupportChat::where('public_id', $id)->firstOrFail();
        $chat->update($request->validate(['status' => ['required', Rule::in(SupportChat::STATUSES)]]));

        return $this->ok($this->row($chat));
    }

    private function row(SupportChat $c): array
    {
        $last = collect($c->messages)->where('role', 'visitor')->last();

        return [
            'id' => $c->public_id,
            'name' => $c->visitor_name,
            'phone' => $c->visitor_phone,
            'business' => $c->tenant?->name,
            'page' => $c->page,
            'status' => $c->status,
            'count' => count($c->messages ?? []),
            'last_text' => $last['text'] ?? null,
            'last_message_at' => $c->last_message_at?->toIso8601String(),
        ];
    }
}
