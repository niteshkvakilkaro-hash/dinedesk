<?php

namespace App\Modules\Ordering\Http\Controllers;

use App\Modules\Ordering\Services\OrderPresenter;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** List row for the dashboard's orders table. */
class OrderRow extends JsonResource
{
    public function toArray(Request $request): array
    {
        return app(OrderPresenter::class)->row($this->resource);
    }
}
