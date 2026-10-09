<?php

namespace App\Modules\Website\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Modules\Audit\Models\AuditLog;
use App\Modules\Tenancy\Support\TenantContext;
use App\Modules\Website\Models\GalleryImage;
use App\Modules\Website\Services\SitePresenter;
use App\Support\ApiException;
use App\Support\Images\ImageService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/** Dashboard → Gallery. Every photo needs alt text (it is read aloud to blind visitors). */
class GalleryController extends Controller
{
    public function __construct(
        private readonly TenantContext $context,
        private readonly SitePresenter $presenter,
        private readonly ImageService $images,
    ) {}

    public function index(): JsonResponse
    {
        return $this->ok($this->presenter->gallery(), null, ['max' => (int) config('dinedesk.gallery_max_images')]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'image' => ImageService::rules(),
            ...$this->textRules(),
        ], $this->messages());

        $max = (int) config('dinedesk.gallery_max_images');
        if (GalleryImage::count() >= $max) {
            throw new ApiException("The gallery holds up to {$max} photos. Remove one to add another.", 422, 'gallery_full');
        }

        $image = GalleryImage::create([
            'image' => $this->images->store($request->file('image'), $this->context->require(), 'gallery'),
            'alt_text' => strip_tags($data['alt_text']),
            'caption' => isset($data['caption']) ? strip_tags($data['caption']) : null,
            'category' => $data['category'] ?? 'food',
            'sort_order' => (int) GalleryImage::max('sort_order') + 1,
        ]);
        AuditLog::record('gallery.added', $image);

        return $this->created($this->presenter->galleryItem($image), 'Photo added.');
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $image = GalleryImage::findOrFail($id);
        $data = $request->validate($this->textRules(), $this->messages());
        $image->update([
            'alt_text' => strip_tags($data['alt_text']),
            'caption' => isset($data['caption']) ? strip_tags($data['caption']) : null,
            'category' => $data['category'] ?? $image->category,
        ]);

        return $this->ok($this->presenter->galleryItem($image), 'Photo updated.');
    }

    public function destroy(int $id): JsonResponse
    {
        $image = GalleryImage::findOrFail($id);
        $this->images->delete($image->image);
        $image->delete();
        AuditLog::record('gallery.removed', $image);

        return $this->ok(null, 'Photo removed.');
    }

    public function reorder(Request $request): JsonResponse
    {
        $data = $request->validate(['ids' => ['required', 'array', 'max:500'], 'ids.*' => ['integer', 'distinct']]);
        $owned = GalleryImage::whereIn('id', $data['ids'])->pluck('id')->all();
        if (count($owned) !== count($data['ids'])) {
            throw new ApiException('Some photos could not be found.', 422, 'invalid_ids');
        }
        DB::transaction(function () use ($data) {
            foreach ($data['ids'] as $i => $id) {
                GalleryImage::whereKey($id)->update(['sort_order' => $i + 1]);
            }
        });

        return $this->ok($this->presenter->gallery(), 'Order saved.');
    }

    private function textRules(): array
    {
        return [
            'alt_text' => ['required', 'string', 'min:3', 'max:200'],
            'caption' => ['nullable', 'string', 'max:200'],
            'category' => ['nullable', Rule::in(GalleryImage::CATEGORIES)],
        ];
    }

    private function messages(): array
    {
        return [
            'alt_text.required' => 'Describe the photo in a few words (e.g. "Paneer tikka on a brass plate").',
            'image.dimensions' => 'Images must be at least 200×200 pixels.',
            'image.max' => 'Images must be smaller than '.(config('dinedesk.images.max_kb') / 1024).' MB.',
        ];
    }
}
