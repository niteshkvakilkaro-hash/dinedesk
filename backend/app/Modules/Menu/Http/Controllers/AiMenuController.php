<?php

namespace App\Modules\Menu\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Modules\Audit\Models\AuditLog;
use App\Modules\Menu\Services\DishWriter;
use App\Modules\Menu\Services\MenuReader;
use App\Support\Ai\Ai;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/** Dashboard → Menu: read a printed menu from photos, and suggest dish descriptions. */
class AiMenuController extends Controller
{
    public function status(Ai $ai): JsonResponse
    {
        return $this->ok(['enabled' => $ai->enabled()]);
    }

    /** Returns rows to review; the dashboard saves them through the CSV import. */
    public function read(Request $request, MenuReader $reader): JsonResponse
    {
        $request->validate([
            'files' => ['required', 'array', 'min:1', 'max:'.MenuReader::MAX_FILES],
            'files.*' => ['file', 'max:10240', 'mimes:jpg,jpeg,png,webp,pdf'],
        ], ['files.*.mimes' => 'Upload photos (JPG, PNG, WEBP) or a PDF of the menu.', 'files.*.max' => 'Each file can be up to 10 MB.']);
        $result = $reader->read($request->file('files'));
        AuditLog::record('menu.ai_read', null, ['pages' => count($request->file('files')), 'dishes' => count($result['rows'])]);

        return $this->ok($result, count($result['rows']).' dishes found. Check them before adding.');
    }

    public function describe(Request $request, DishWriter $writer): JsonResponse
    {
        $d = $request->validate([
            'name' => ['required', 'string', 'max:150'],
            'category' => ['nullable', 'string', 'max:100'],
            'food_type' => ['nullable', Rule::in(['veg', 'non_veg', 'egg'])],
        ]);

        return $this->ok($writer->write(strip_tags($d['name']), isset($d['category']) ? strip_tags($d['category']) : null, $d['food_type'] ?? null));
    }
}
