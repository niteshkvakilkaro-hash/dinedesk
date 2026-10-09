<?php

namespace App\Modules\Menu\Services;

use App\Modules\Menu\Models\ItemVariant;
use App\Modules\Menu\Models\MenuCategory;
use App\Modules\Menu\Models\MenuItem;
use App\Modules\Plans\Services\FeatureService;
use App\Modules\Tenancy\Models\Tenant;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;

/**
 * CSV menu import. Always validate first (dry run), then import everything in
 * one transaction or nothing. Categories are matched by name (case-insensitive)
 * and created when missing; every row becomes a new dish.
 *
 * Columns (header row required; only category, name and price/variants are mandatory):
 * category, name, name_hi, description, description_hi, price, food_type, spice_level,
 * tax_rate, variants ("Half:180|Full:320"), allergens ("dairy|nuts"),
 * is_bestseller, is_chefs_special, is_available
 */
class MenuImport
{
    public const COLUMNS = [
        'category', 'name', 'name_hi', 'description', 'description_hi', 'price', 'food_type', 'spice_level',
        'tax_rate', 'variants', 'allergens', 'is_bestseller', 'is_chefs_special', 'is_available',
    ];

    public const MAX_ROWS = 1000;

    public function __construct(private readonly FeatureService $features) {}

    public static function template(): string
    {
        $rows = [
            self::COLUMNS,
            ['Starters', 'Paneer Tikka', 'पनीर टिक्का', 'Cottage cheese marinated in yoghurt and spices', '', '280', 'veg', '2', '', '', 'dairy', 'yes', 'no', 'yes'],
            ['Main Course', 'Dal Makhani', 'दाल मखनी', 'Black lentils slow-cooked with butter', '', '', 'veg', '1', '5', 'Half:180|Full:320', 'dairy', 'no', 'no', 'yes'],
        ];
        $out = fopen('php://temp', 'r+');
        foreach ($rows as $r) {
            fputcsv($out, $r);
        }
        rewind($out);

        return "\u{FEFF}".stream_get_contents($out); // BOM so Excel opens Hindi correctly
    }

    /**
     * @return array{valid: bool, rows: int, new_categories: list<string>, errors: list<array{row: int, messages: list<string>}>, preview: list<array>}
     */
    public function analyse(string $path, Tenant $tenant): array
    {
        $parsed = $this->parse($path);
        if (isset($parsed['error'])) {
            return ['valid' => false, 'rows' => 0, 'new_categories' => [], 'errors' => [['row' => 1, 'messages' => [$parsed['error']]]], 'preview' => []];
        }

        $existing = MenuCategory::pluck('name')->map(fn ($n) => mb_strtolower($n))->all();
        $errors = [];
        $newCategories = [];
        $preview = [];
        foreach ($parsed['rows'] as $n => $row) {
            $messages = $this->validateRow($row);
            if ($messages) {
                $errors[] = ['row' => $n, 'messages' => $messages];
            }
            $cat = trim($row['category'] ?? '');
            if ($cat !== '' && ! in_array(mb_strtolower($cat), $existing, true)) {
                $newCategories[] = $cat;
                $existing[] = mb_strtolower($cat); // "Starters" and "starters" are one section
            }
            if (count($preview) < 20) {
                $preview[] = ['row' => $n, 'category' => $cat, 'name' => $row['name'] ?? '', 'price' => $row['price'] ?? '', 'variants' => $row['variants'] ?? ''];
            }
        }

        $limit = $this->features->limit($tenant, 'menu_items');
        $total = MenuItem::count() + count($parsed['rows']);
        if ($limit !== null && $total > $limit) {
            $errors[] = ['row' => 0, 'messages' => ["Your plan allows {$limit} dishes; this import would bring you to {$total}. Upgrade or import fewer rows."]];
        }

        return ['valid' => ! $errors, 'rows' => count($parsed['rows']), 'new_categories' => $newCategories, 'errors' => $errors, 'preview' => $preview];
    }

    /** @return int number of dishes created */
    public function import(string $path): int
    {
        $rows = $this->parse($path)['rows'];

        return DB::transaction(function () use ($rows) {
            $categories = MenuCategory::get()->keyBy(fn ($c) => mb_strtolower($c->name));
            $nextCat = (int) MenuCategory::max('sort_order');
            $count = 0;
            foreach ($rows as $row) {
                $key = mb_strtolower(trim($row['category']));
                if (! $categories->has($key)) {
                    $name = trim($row['category']);
                    $categories[$key] = MenuCategory::create(['name' => $name, 'slug' => $this->uniqueSlug($name), 'sort_order' => ++$nextCat]);
                }
                $category = $categories[$key];
                $variants = $this->variants($row['variants'] ?? '');
                $item = MenuItem::create([
                    'menu_category_id' => $category->id,
                    'name' => strip_tags(trim($row['name'])),
                    'name_hi' => $this->text($row['name_hi'] ?? null),
                    'description' => $this->text($row['description'] ?? null),
                    'description_hi' => $this->text($row['description_hi'] ?? null),
                    'price' => $variants ? min(array_column($variants, 'price')) : $row['price'],
                    'tax_rate' => ($row['tax_rate'] ?? '') === '' ? null : $row['tax_rate'],
                    'food_type' => $this->foodType($row['food_type'] ?? ''),
                    'spice_level' => (int) ($row['spice_level'] ?? 0),
                    'allergens' => $this->allergens($row['allergens'] ?? '') ?: null,
                    'is_bestseller' => $this->bool($row['is_bestseller'] ?? '', false),
                    'is_chefs_special' => $this->bool($row['is_chefs_special'] ?? '', false),
                    'is_available' => $this->bool($row['is_available'] ?? '', true),
                    'sort_order' => (int) MenuItem::where('menu_category_id', $category->id)->max('sort_order') + 1,
                ]);
                foreach ($variants as $vi => $v) {
                    ItemVariant::create(['menu_item_id' => $item->id, 'name' => $v['name'], 'price' => $v['price'], 'is_default' => $vi === 0, 'sort_order' => $vi]);
                }
                $count++;
            }

            return $count;
        });
    }

    /** @return array{rows?: array<int, array>, error?: string} keyed by spreadsheet row number */
    private function parse(string $path): array
    {
        $h = fopen($path, 'r');
        if (! $h) {
            return ['error' => 'Could not read the file.'];
        }
        $header = fgetcsv($h);
        if (! $header) {
            return ['error' => 'The file is empty.'];
        }
        $header = array_map(fn ($c) => Str::snake(trim(str_replace("\u{FEFF}", '', (string) $c))), $header);
        foreach (['category', 'name'] as $required) {
            if (! in_array($required, $header, true)) {
                return ['error' => "Missing the \"{$required}\" column. Download the template to see the expected columns."];
            }
        }
        $rows = [];
        $line = 1;
        while (($data = fgetcsv($h)) !== false) {
            $line++;
            if (count(array_filter($data, fn ($v) => trim((string) $v) !== '')) === 0) {
                continue;
            }
            if (count($rows) >= self::MAX_ROWS) {
                fclose($h);

                return ['error' => 'A file can have up to '.self::MAX_ROWS.' dishes.'];
            }
            $rows[$line] = array_combine($header, array_pad(array_slice($data, 0, count($header)), count($header), ''));
        }
        fclose($h);
        if (! $rows) {
            return ['error' => 'No dishes found below the header row.'];
        }

        return ['rows' => $rows];
    }

    private function validateRow(array $row): array
    {
        $variants = trim($row['variants'] ?? '');
        $v = Validator::make($row, [
            'category' => ['required', 'string', 'max:100'],
            'name' => ['required', 'string', 'max:150'],
            'name_hi' => ['nullable', 'string', 'max:150'],
            'description' => ['nullable', 'string', 'max:1000'],
            'price' => [$variants === '' ? 'required' : 'nullable', 'nullable', 'numeric', 'min:0', 'max:100000'],
            'spice_level' => ['nullable', 'integer', 'between:0,3'],
            'tax_rate' => ['nullable', 'in:0,5,12,18,28'],
        ], [
            'price.required' => 'Price is required (or give variants like "Half:180|Full:320").',
            'tax_rate.in' => 'GST rate must be 0, 5, 12, 18 or 28.',
        ]);
        $messages = $v->errors()->all();
        if (($row['food_type'] ?? '') !== '' && $this->foodType($row['food_type'], null) === null) {
            $messages[] = 'food_type must be veg, non_veg or egg.';
        }
        if ($variants !== '' && ! $this->variants($variants)) {
            $messages[] = 'Variants must look like "Half:180|Full:320".';
        }
        $unknown = array_diff($this->allergens($row['allergens'] ?? '', false), MenuItem::ALLERGENS);
        if ($unknown) {
            $messages[] = 'Unknown allergen(s): '.implode(', ', $unknown).'.';
        }

        return $messages;
    }

    /** @return list<array{name: string, price: string}> */
    private function variants(string $raw): array
    {
        $raw = trim($raw);
        if ($raw === '') {
            return [];
        }
        $out = [];
        foreach (explode('|', $raw) as $part) {
            if (! preg_match('/^\s*([^:]{1,60}?)\s*:\s*(\d{1,6}(?:\.\d{1,2})?)\s*$/u', $part, $m)) {
                return [];
            }
            $out[] = ['name' => strip_tags($m[1]), 'price' => $m[2]];
        }

        return count($out) <= 10 ? $out : [];
    }

    private function allergens(string $raw, bool $onlyKnown = true): array
    {
        $list = array_values(array_filter(array_map(fn ($a) => strtolower(trim($a)), preg_split('/[|,]/', $raw) ?: [])));

        return $onlyKnown ? array_values(array_intersect($list, MenuItem::ALLERGENS)) : $list;
    }

    private function foodType(string $raw, ?string $default = 'veg'): ?string
    {
        $v = strtolower(str_replace(['-', ' '], '_', trim($raw)));

        return match ($v) {
            '' => $default,
            'veg', 'vegetarian', 'v' => 'veg',
            'non_veg', 'nonveg', 'nv' => 'non_veg',
            'egg', 'eggetarian' => 'egg',
            default => null,
        };
    }

    private function bool(string $raw, bool $default): bool
    {
        $v = strtolower(trim($raw));

        return $v === '' ? $default : in_array($v, ['1', 'yes', 'y', 'true', 'haan'], true);
    }

    private function text(?string $v): ?string
    {
        $v = $v === null ? '' : trim(strip_tags($v));

        return $v === '' ? null : $v;
    }

    private function uniqueSlug(string $name): string
    {
        $base = Str::slug(Str::ascii($name)) ?: 'section';
        $slug = $base;
        for ($i = 2; MenuCategory::where('slug', $slug)->exists(); $i++) {
            $slug = "{$base}-{$i}";
        }

        return $slug;
    }
}
