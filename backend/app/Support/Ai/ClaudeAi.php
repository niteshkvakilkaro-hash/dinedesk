<?php

namespace App\Support\Ai;

use Anthropic\Client;
use Anthropic\Core\Exceptions\APIStatusException;
use App\Support\ApiException;
use Illuminate\Support\Facades\Log;
use Throwable;

/** Claude through the official Anthropic SDK (key and model in config/dinedesk.php → ai). */
class ClaudeAi implements Ai
{
    public function enabled(): bool
    {
        return (string) config('dinedesk.ai.api_key') !== '';
    }

    public function json(string $system, array $content, array $schema, int $maxTokens = 16000): array
    {
        if (! $this->enabled()) {
            throw new ApiException('AI features are not set up yet (no ANTHROPIC_API_KEY on the server).', 503, 'ai_not_configured');
        }
        $client = new Client(apiKey: (string) config('dinedesk.ai.api_key'));

        try {
            $message = $client->beta->messages->create(
                model: (string) config('dinedesk.ai.model'),
                maxTokens: $maxTokens,
                system: $system,
                messages: [['role' => 'user', 'content' => $content]],
                outputConfig: ['effort' => 'medium', 'format' => ['type' => 'json_schema', 'schema' => $schema]],
                // If the model declines for policy reasons, the server retries on its default fallback.
                fallbacks: 'default',
                betas: ['server-side-fallback-2026-07-01'],
            );
        } catch (APIStatusException $e) {
            Log::warning('AI request failed', ['type' => $e->type?->value, 'message' => $e->getMessage()]);
            throw new ApiException('The AI could not answer right now. Please try again in a minute.', 502, 'ai_failed');
        } catch (Throwable $e) {
            Log::warning('AI request failed', ['message' => $e->getMessage()]);
            throw new ApiException('The AI could not be reached right now. Please try again in a minute.', 502, 'ai_failed');
        }

        if ($message->stopReason === 'refusal') {
            throw new ApiException('The AI declined this request.', 422, 'ai_refused');
        }
        if ($message->stopReason === 'max_tokens') {
            throw new ApiException('That was too much to read at once. Try fewer pages.', 422, 'ai_too_long');
        }
        foreach ($message->content as $block) {
            if ($block->type === 'text') {
                $data = json_decode($block->text, true);
                if (is_array($data)) {
                    return $data;
                }
            }
        }
        throw new ApiException('The AI answer could not be read. Please try again.', 502, 'ai_failed');
    }
}
