<?php

namespace App\Support\Ai;

/**
 * The AI features ask for JSON that matches a schema (structured output). Bound to the Claude
 * implementation; tests bind a fake so no request leaves the machine.
 */
interface Ai
{
    public function enabled(): bool;

    /**
     * @param  list<array<string, mixed>>  $content  user content blocks (text, image, document)
     * @param  array<string, mixed>  $schema  JSON schema of the answer
     * @return array<string, mixed>
     */
    public function json(string $system, array $content, array $schema, int $maxTokens = 16000): array;
}
