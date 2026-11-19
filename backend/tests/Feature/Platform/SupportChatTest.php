<?php

namespace Tests\Feature\Platform;

use App\Models\User;
use App\Modules\Platform\Models\SupportChat;
use Tests\TestCase;

class SupportChatTest extends TestCase
{
    public function test_public_config_says_what_really_works(): void
    {
        config(['dinedesk.otp.driver' => 'log']);
        $this->app->detectEnvironment(fn () => 'production');
        $this->getJson('/api/v1/public/config')->assertOk()
            ->assertJsonPath('data.support.whatsapp', '918502837831')
            ->assertJsonPath('data.sign_in.mobile', false); // codes would only go to the log

        config(['dinedesk.otp.driver' => 'sms']);
        $this->getJson('/api/v1/public/config')->assertJsonPath('data.sign_in.mobile', true);
    }

    public function test_a_visitor_chats_and_the_conversation_is_kept(): void
    {
        config(['dinedesk.ai.api_key' => '']); // keyword answers
        $first = $this->postJson('/api/v1/support/chat', ['message' => 'price kitna hai?', 'page' => '/pricing'])->assertOk()
            ->assertJsonPath('data.handoff', false);
        $this->assertStringContainsString('free trial', $first->json('data.reply'));
        $this->assertStringStartsWith('https://wa.me/918502837831', $first->json('data.whatsapp_url'));

        $id = $first->json('data.chat_id');
        $this->postJson('/api/v1/support/chat', ['chat_id' => $id, 'message' => 'I want a custom deal', 'name' => 'Ravi', 'phone' => '9876543210'])
            ->assertOk()->assertJsonPath('data.chat_id', $id)->assertJsonPath('data.handoff', true);

        $chat = SupportChat::where('public_id', $id)->firstOrFail();
        $this->assertCount(4, $chat->messages);
        $this->assertSame(['Ravi', '+919876543210', 'new'], [$chat->visitor_name, $chat->visitor_phone, $chat->status]);
    }

    public function test_whole_words_only_in_keyword_answers(): void
    {
        config(['dinedesk.ai.api_key' => '']);
        // "this" must not be read as "hi", "orders" not as "rs".
        $reply = $this->postJson('/api/v1/support/chat', ['message' => 'tell me about this'])->json('data');
        $this->assertTrue($reply['handoff']);
    }

    public function test_only_the_super_admin_reads_chats(): void
    {
        $id = $this->postJson('/api/v1/support/chat', ['message' => 'hello'])->json('data.chat_id');
        $admin = User::factory()->create(['is_platform_admin' => true]);
        $owner = User::factory()->create();

        $this->actingAs($owner, 'sanctum')->getJson('/api/v1/platform/chats')->assertForbidden();
        $this->actingAs($admin, 'sanctum')->getJson('/api/v1/platform/chats')->assertOk()->assertJsonPath('meta.new', 1);
        $this->actingAs($admin, 'sanctum')->getJson("/api/v1/platform/chats/{$id}")->assertOk()->assertJsonPath('data.status', 'seen')->assertJsonCount(2, 'data.messages');
        $this->actingAs($admin, 'sanctum')->patchJson("/api/v1/platform/chats/{$id}", ['status' => 'closed'])->assertJsonPath('data.status', 'closed');
    }
}
