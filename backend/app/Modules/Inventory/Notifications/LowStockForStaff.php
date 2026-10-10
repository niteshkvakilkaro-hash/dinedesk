<?php

namespace App\Modules\Inventory\Notifications;

use App\Modules\Inventory\Models\InventoryItem;
use Illuminate\Notifications\Notification;

/** In-app alert: a raw material reached its low-stock level. */
class LowStockForStaff extends Notification
{
    public function __construct(public readonly InventoryItem $item) {}

    public function via(object $notifiable): array
    {
        return ['database'];
    }

    public function toArray(object $notifiable): array
    {
        return [
            'tenant_id' => $this->item->tenant_id,
            'kind' => 'low_stock',
            'inventory_item_id' => $this->item->id,
            'name' => $this->item->name,
            'stock' => $this->item->stock,
            'unit' => $this->item->unit,
        ];
    }
}
