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

// Hotel: website bookings whose online advance never came in release their room.
Artisan::command('hotel:expire-holds', function (TenantContext $context) {
    $tenantIds = \App\Modules\Hotel\Models\RoomBooking::withoutTenancy()
        ->where('status', 'pending')->whereNotNull('hold_expires_at')->where('hold_expires_at', '<', now())
        ->distinct()->pluck('tenant_id');
    $total = 0;
    foreach (Tenant::whereIn('id', $tenantIds)->get() as $tenant) {
        $total += $context->run($tenant, fn () => app(\App\Modules\Hotel\Services\RoomBookings::class)->expireHolds());
    }
    $this->info("Released {$total} unpaid room booking(s).");
})->purpose('Cancel room bookings whose advance was never paid');

Schedule::command('hotel:expire-holds')->everyFiveMinutes()->withoutOverlapping();

// Hotel: guest ID documents are deleted once their keep period after check-out ends.
Artisan::command('hotel:purge-documents', function (TenantContext $context) {
    $tenantIds = \App\Modules\Hotel\Models\GuestDocument::withoutTenancy()
        ->where('delete_after', '<', now()->format('Y-m-d'))->distinct()->pluck('tenant_id');
    $total = 0;
    foreach (Tenant::whereIn('id', $tenantIds)->get() as $tenant) {
        $total += $context->run($tenant, fn () => app(\App\Modules\Hotel\Services\GuestDocuments::class)->purge());
    }
    $this->info("Deleted {$total} guest document(s).");
})->purpose('Delete guest ID documents past their keep date');

Schedule::command('hotel:purge-documents')->dailyAt('03:30')->withoutOverlapping();
