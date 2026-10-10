<?php

use App\Modules\Ordering\Models\Order;
use App\Modules\Ordering\Services\OrderFlow;
use App\Modules\Tenancy\Models\Tenant;
use App\Modules\Tenancy\Support\TenantContext;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// Online orders whose payment never completed are released after 30 minutes.
Artisan::command('orders:expire-unpaid', function (TenantContext $context) {
    $tenantIds = Order::withoutTenancy()
        ->where('payment_method', 'online')->whereIn('payment_status', ['pending', 'failed'])->where('status', 'pending')
        ->where('placed_at', '<', now()->subMinutes(OrderFlow::PAYMENT_WINDOW_MINUTES))
        ->distinct()->pluck('tenant_id');
    $total = 0;
    foreach (Tenant::whereIn('id', $tenantIds)->get() as $tenant) {
        $total += $context->run($tenant, fn () => app(OrderFlow::class)->expireUnpaid());
    }
    $this->info("Released {$total} unpaid order(s).");
})->purpose('Cancel online orders that were never paid');

Schedule::command('orders:expire-unpaid')->everyFiveMinutes()->withoutOverlapping();

// Reminder messages for confirmed table bookings (each business sets how many hours before).
Artisan::command('reservations:send-reminders', function (TenantContext $context) {
    $tenantIds = \App\Modules\Reservations\Models\Reservation::withoutTenancy()
        ->where('status', 'confirmed')->whereNull('reminder_sent_at')
        ->whereBetween('starts_at', [now(), now()->addHours(48)])
        ->distinct()->pluck('tenant_id');
    $total = 0;
    foreach (Tenant::whereIn('id', $tenantIds)->get() as $tenant) {
        $total += $context->run($tenant, fn () => app(\App\Modules\Reservations\Services\Bookings::class)->sendReminders());
    }
    $this->info("Sent {$total} booking reminder(s).");
})->purpose('Remind guests of confirmed table bookings');

Schedule::command('reservations:send-reminders')->everyFiveMinutes()->withoutOverlapping();
