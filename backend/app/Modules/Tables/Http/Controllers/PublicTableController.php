<?php

namespace App\Modules\Tables\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Modules\Tables\Models\TableRequest;
use App\Modules\Tables\Services\DineIn;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/** Guests at a table, from its QR code (tenant from host; the token identifies the table). */
class PublicTableController extends Controller
{
    public function __construct(private readonly DineIn $dineIn) {}

    public function show(string $token): JsonResponse
    {
        return $this->ok($this->dineIn->publicView($this->dineIn->resolve($token)));
    }

    public function request(Request $request, string $token): JsonResponse
    {
        $data = $request->validate(['type' => ['required', Rule::in(TableRequest::TYPES)]]);
        $table = $this->dineIn->resolve($token);
        $this->dineIn->request($table, $data['type']);

        return $this->ok($this->dineIn->publicView($table), $data['type'] === 'bill' ? 'The staff will bring your bill.' : 'A waiter is on the way.');
    }
}
