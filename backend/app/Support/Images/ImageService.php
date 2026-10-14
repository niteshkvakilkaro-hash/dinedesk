<?php

namespace App\Support\Images;

use App\Modules\Tenancy\Models\Tenant;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Intervention\Image\Drivers\Gd\Driver;
use Intervention\Image\ImageManager;

/**
 * Turns an upload into WebP widths plus a tiny blur-up placeholder, stored
 * under tenants/{public_id}/{folder}/ on the public disk. The stored payload
 * ({path, width, height, placeholder}) lives in a json column; present() turns
 * it into {src, srcset, width, height, placeholder} for the frontend.
 */
class ImageService
{
    /** Upload validation rules shared by every image endpoint. */
    public static function rules(): array
    {
        return ['required', 'file', 'image', 'mimes:jpg,jpeg,png,webp', 'max:'.config('dinedesk.images.max_kb'), 'dimensions:min_width=200,min_height=200,max_width=8000,max_height=8000'];
    }

    /** @return array{path: string, width: int, height: int, placeholder: string} */
    public function store(UploadedFile|string $source, Tenant $tenant, string $folder): array
    {
        $manager = new ImageManager(new Driver);
        $image = $manager->read($source instanceof UploadedFile ? $source->getRealPath() : $source);
        $image->orient();

        $disk = Storage::disk('public');
        $base = "tenants/{$tenant->public_id}/".trim($folder, '/').'/'.Str::lower((string) Str::ulid());

        $sourceWidth = $image->width();
        $widths = $this->widthsFor($sourceWidth);
        $largest = max($widths);
        $quality = (int) config('dinedesk.images.quality');

        foreach ($widths as $width) {
            $variant = clone $image;
            $variant->scaleDown(width: $width);
            $disk->put("{$base}-{$width}.webp", (string) $variant->toWebp($quality));
        }

        $tiny = clone $image;
        $tiny->scaleDown(width: 24)->blur(2);

        return [
            'path' => $base,
            'width' => $largest,
            'height' => (int) round($image->height() * ($largest / $sourceWidth)),
            'placeholder' => 'data:image/webp;base64,'.base64_encode((string) $tiny->toWebp(40)),
        ];
    }

    /** @return array{src: string, srcset: string, width: int, height: int, placeholder: ?string}|null */
    public function present(?array $stored): ?array
    {
        if (! $stored || empty($stored['path'])) {
            return null;
        }
        $disk = Storage::disk('public');
        $width = (int) $stored['width'];

        return [
            'src' => $disk->url("{$stored['path']}-{$width}.webp"),
            'srcset' => collect($this->widthsFor($width))->map(fn ($w) => $disk->url("{$stored['path']}-{$w}.webp")." {$w}w")->implode(', '),
            'width' => $width,
            'height' => (int) $stored['height'],
            'placeholder' => $stored['placeholder'] ?? null,
            // Licensed (demo) photos carry their attribution: { author, license, source }.
            'credit' => $stored['credit'] ?? null,
        ];
    }

    public function delete(?array $stored): void
    {
        if (! $stored || empty($stored['path'])) {
            return;
        }
        $disk = Storage::disk('public');
        foreach ($this->widthsFor((int) $stored['width']) as $w) {
            $disk->delete("{$stored['path']}-{$w}.webp");
        }
    }

    /** Configured widths below the source, plus the source width capped at the largest. Never upscales. */
    private function widthsFor(int $sourceWidth): array
    {
        $configured = config('dinedesk.images.widths');
        $cap = min($sourceWidth, max($configured));
        $widths = array_values(array_filter($configured, fn ($w) => $w < $cap));
        $widths[] = $cap;

        return $widths;
    }
}
