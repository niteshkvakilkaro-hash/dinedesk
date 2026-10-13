<?php

namespace App\Modules\Menu\Services;

use App\Support\Ai\Ai;

/** A short, plain description of a dish in English and Hindi, for the owner to edit before saving. */
class DishWriter
{
    private const SYSTEM = <<<'TXT'
        You write menu descriptions for an Indian restaurant's website.
        - One sentence, at most 140 characters: what the dish is and how it is made or served.
        - Describe the dish as it is usually made. No claims about this restaurant (no "our famous", "award-winning", "best in town"), no prices, no emojis.
        - Give the same description in simple Hindi (Devanagari).
        TXT;

    public function __construct(private readonly Ai $ai) {}

    /** @return array{description: string, description_hi: string} */
    public function write(string $name, ?string $category, ?string $foodType): array
    {
        $about = trim($name.($category ? " (menu section: {$category})" : '').($foodType ? ", {$foodType}" : ''));
        $data = $this->ai->json(self::SYSTEM, [['type' => 'text', 'text' => "Dish: {$about}"]], [
            'type' => 'object',
            'properties' => ['description' => ['type' => 'string'], 'description_hi' => ['type' => 'string']],
            'required' => ['description', 'description_hi'],
            'additionalProperties' => false,
        ], 2000);

        return [
            'description' => mb_substr(trim(strip_tags((string) ($data['description'] ?? ''))), 0, 300),
            'description_hi' => mb_substr(trim(strip_tags((string) ($data['description_hi'] ?? ''))), 0, 300),
        ];
    }
}
