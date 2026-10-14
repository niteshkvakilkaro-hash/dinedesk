<?php

namespace App\Modules\Menu\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Modules\Audit\Models\AuditLog;
use App\Modules\Menu\Services\ContentTranslations;
use App\Modules\Tenancy\Support\TenantContext;
use App\Support\Translations;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Dashboard → Menu → Languages: the owner's menu, rooms, offers and website text in the
 * site's other languages (Hindi stays in the normal editors). AI drafts, the owner saves.
 */
class TranslationController extends Controller
{
    public function __construct(
        private readonly TenantContext $context,
        private readonly ContentTranslations $translations,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $lang = $request->validate(['lang' => ['required', Rule::in(Translations::languages())]])['lang'];
        $entries = $this->translations->entries($this->context->require(), $request->user(), $lang);

        return $this->ok(['lang' => $lang, 'entries' => array_map([ContentTranslations::class, 'present'], $entries)]);
    }

    public function update(Request $request): JsonResponse
    {
        $data = $request->validate([
            'lang' => ['required', Rule::in(Translations::languages())],
            'values' => ['required', 'array', 'max:2000'],
            'values.*' => ['nullable', 'string'],
        ]);
        $changed = $this->translations->save($this->context->require(), $request->user(), $data['lang'], $data['values']);
        if ($changed) {
            AuditLog::record('menu.translations_saved', null, ['lang' => $data['lang'], 'texts' => $changed]);
        }
        $entries = $this->translations->entries($this->context->require(), $request->user(), $data['lang']);

        return $this->ok(['lang' => $data['lang'], 'entries' => array_map([ContentTranslations::class, 'present'], $entries)], 'Translations saved.');
    }

    /** Drafts only: the owner checks them and saves with update(). */
    public function suggest(Request $request): JsonResponse
    {
        $data = $request->validate([
            'lang' => ['required', Rule::in(Translations::languages())],
            'keys' => ['required', 'array', 'min:1', 'max:'.ContentTranslations::MAX_AI_KEYS],
            'keys.*' => ['string', 'max:60', 'distinct'],
        ]);

        return $this->ok(['suggestions' => (object) $this->translations->suggest($this->context->require(), $request->user(), $data['lang'], $data['keys'])]);
    }
}
