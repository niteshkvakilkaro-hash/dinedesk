<?php

namespace App\Modules\Menu\Services;

use App\Support\Ai\Ai;
use App\Support\ApiException;
use Illuminate\Http\UploadedFile;

/**
 * AI menu import: photos (or a PDF) of a printed menu become rows in the CSV-import shape, for
 * the owner to check and correct before anything is saved. Nothing is invented: a price that
 * can't be read comes back empty, and the owner fills it in.
 */
class MenuReader
{
    public const MAX_FILES = 6;

    /** Long edge sent to the model; enough to read small print, small enough to upload quickly. */
    private const MAX_EDGE = 2000;

    private const SYSTEM = <<<'TXT'
        You read photos of printed restaurant menus (mostly Indian) and turn them into structured data.
        - Copy dish and section names as printed, fixing only obvious spelling slips. Keep Hindi names in Devanagari if printed that way.
        - Prices are in rupees. Write numbers only (180, not "Rs. 180/-"). If a price can't be read, use null; never guess one.
        - Two or more prices for one dish (Half / Full, Small / Large, Quarter / Half / Full) are variants with names.
        - food_type: "veg" or "non_veg" from the green/red symbol or an obvious ingredient (chicken, mutton, fish, prawn -> non_veg; paneer, dal, veg -> veg; egg dishes -> "egg"). Use "unknown" when unsure.
        - description: the printed description if there is one, otherwise null. Do not write descriptions yourself.
        - Leave out things that are not dishes (phone numbers, timings, taxes, offers), but mention useful ones (like "GST extra", "Prices may change") in notes.
        - If part of a page is unreadable, say so in notes rather than guessing.
        TXT;

    public function __construct(private readonly Ai $ai) {}

    /**
     * @param  list<UploadedFile>  $files
     * @return array{rows: list<array<string, string>>, notes: list<string>}
     */
    public function read(array $files): array
    {
        $content = [];
        foreach ($files as $file) {
            $content[] = $this->block($file);
        }
        $content[] = ['type' => 'text', 'text' => 'Read every dish on these menu pages, in the order printed.'];
        $data = $this->ai->json(self::SYSTEM, $content, self::schema());

        $rows = [];
        foreach ($data['categories'] ?? [] as $category) {
            $section = trim((string) ($category['name'] ?? '')) ?: 'Menu';
            foreach ($category['items'] ?? [] as $item) {
                $name = trim((string) ($item['name'] ?? ''));
                if ($name === '') {
                    continue;
                }
                $variants = collect($item['variants'] ?? [])
                    ->filter(fn ($v) => trim((string) ($v['name'] ?? '')) !== '' && is_numeric($v['price'] ?? null))
                    ->map(fn ($v) => str_replace(['|', ':'], ' ', trim($v['name'])).':'.$this->money($v['price']))
                    ->implode('|');
                $type = $item['food_type'] ?? 'unknown';
                $rows[] = [
                    'category' => mb_substr($section, 0, 100),
                    'name' => mb_substr($name, 0, 150),
                    'description' => mb_substr(trim((string) ($item['description'] ?? '')), 0, 1000),
                    'price' => $variants === '' && is_numeric($item['price'] ?? null) ? $this->money($item['price']) : '',
                    'food_type' => in_array($type, ['veg', 'non_veg', 'egg'], true) ? $type : '',
                    'variants' => $variants,
                ];
            }
        }
        if (! $rows) {
            throw new ApiException('No dishes could be read from these pages. Try a clearer, straight-on photo in good light.', 422, 'no_dishes');
        }

        return ['rows' => array_slice($rows, 0, MenuImport::MAX_ROWS), 'notes' => array_values(array_filter(array_map('strval', $data['notes'] ?? [])))];
    }

    /** @return array<string, mixed> */
    private function block(UploadedFile $file): array
    {
        $mime = (string) $file->getMimeType();
        if ($mime === 'application/pdf') {
            return ['type' => 'document', 'source' => ['type' => 'base64', 'mediaType' => 'application/pdf', 'data' => base64_encode((string) file_get_contents($file->getRealPath()))]];
        }

        return ['type' => 'image', 'source' => ['type' => 'base64', 'mediaType' => 'image/jpeg', 'data' => base64_encode($this->shrink($file->getRealPath()))]];
    }

    /** Phone photos are large: re-encode as a JPEG no bigger than MAX_EDGE on its long side. */
    private function shrink(string $path): string
    {
        $src = @imagecreatefromstring((string) file_get_contents($path));
        if (! $src) {
            throw new ApiException('One of the photos could not be opened. Use JPG, PNG or WEBP.', 422, 'bad_image');
        }
        $w = imagesx($src);
        $h = imagesy($src);
        $scale = min(1, self::MAX_EDGE / max($w, $h));
        $dst = $src;
        if ($scale < 1) {
            $dst = imagescale($src, (int) round($w * $scale), (int) round($h * $scale), IMG_BICUBIC) ?: $src;
        }
        ob_start();
        imagejpeg($dst, null, 85);

        return (string) ob_get_clean();
    }

    private function money(mixed $v): string
    {
        $n = round((float) $v, 2);

        return $n == (int) $n ? (string) (int) $n : number_format($n, 2, '.', '');
    }

    /** @return array<string, mixed> */
    private static function schema(): array
    {
        return [
            'type' => 'object',
            'properties' => [
                'categories' => [
                    'type' => 'array',
                    'items' => [
                        'type' => 'object',
                        'properties' => [
                            'name' => ['type' => 'string'],
                            'items' => [
                                'type' => 'array',
                                'items' => [
                                    'type' => 'object',
                                    'properties' => [
                                        'name' => ['type' => 'string'],
                                        'description' => ['type' => ['string', 'null']],
                                        'price' => ['type' => ['number', 'null']],
                                        'food_type' => ['type' => 'string', 'enum' => ['veg', 'non_veg', 'egg', 'unknown']],
                                        'variants' => [
                                            'type' => 'array',
                                            'items' => [
                                                'type' => 'object',
                                                'properties' => ['name' => ['type' => 'string'], 'price' => ['type' => 'number']],
                                                'required' => ['name', 'price'],
                                                'additionalProperties' => false,
                                            ],
                                        ],
                                    ],
                                    'required' => ['name', 'description', 'price', 'food_type', 'variants'],
                                    'additionalProperties' => false,
                                ],
                            ],
                        ],
                        'required' => ['name', 'items'],
                        'additionalProperties' => false,
                    ],
                ],
                'notes' => ['type' => 'array', 'items' => ['type' => 'string']],
            ],
            'required' => ['categories', 'notes'],
            'additionalProperties' => false,
        ];
    }
}
