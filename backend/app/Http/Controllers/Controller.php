<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Pagination\LengthAwarePaginator;

/**
 * Every API response: { data, message, errors, meta }.
 * Controllers stay thin: validate, call an Action/Service, respond.
 */
abstract class Controller
{
    protected function ok(mixed $data = null, ?string $message = null, ?array $meta = null, int $status = 200): JsonResponse
    {
        if ($data instanceof JsonResource) {
            $data = $data->resolve(request());
        }

        return response()->json(['data' => $data, 'message' => $message, 'errors' => null, 'meta' => $meta], $status);
    }

    protected function created(mixed $data = null, ?string $message = null): JsonResponse
    {
        return $this->ok($data, $message, null, 201);
    }

    /** @param class-string<JsonResource> $resource */
    protected function paginated(LengthAwarePaginator $page, string $resource, array $meta = []): JsonResponse
    {
        return $this->ok($resource::collection($page->getCollection()), null, [
            'current_page' => $page->currentPage(),
            'last_page' => $page->lastPage(),
            'per_page' => $page->perPage(),
            'total' => $page->total(),
        ] + $meta);
    }
}
