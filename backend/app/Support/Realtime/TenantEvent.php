<?php

namespace App\Support\Realtime;

use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;

/**
 * A small "something changed" signal on a business's private channel
 * (tenant.{public id}.{topic}). It carries ids and labels only; screens refetch
 * what they show through the normal, permission-checked API.
 */
class TenantEvent implements ShouldBroadcastNow
{
    public function __construct(
        public readonly string $tenantKey,
        public readonly string $topic,
        public readonly string $name,
        public readonly array $payload = [],
    ) {}

    public function broadcastOn(): array
    {
        return [new PrivateChannel("tenant.{$this->tenantKey}.{$this->topic}")];
    }

    public function broadcastAs(): string
    {
        return $this->name;
    }

    public function broadcastWith(): array
    {
        return $this->payload;
    }
}
