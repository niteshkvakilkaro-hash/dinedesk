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

// Billing: trials and paid periods that ran out get a grace period, then read-only (hourly).
Artisan::command('subscriptions:enforce', function () {
    $done = app(\App\Modules\Subscriptions\Services\SubscriptionManager::class)->enforce();
    $this->info("Grace started: {$done['grace']}, made read-only: {$done['read_only']}.");
})->purpose('Start grace periods and apply read-only mode for unpaid businesses');

Schedule::command('subscriptions:enforce')->hourly()->withoutOverlapping();

// Data exports are kept for 7 days.
Artisan::command('exports:purge', function () {
    $count = 0;
    \App\Modules\DataExport\Models\DataExport::withoutTenancy()->where('expires_at', '<', now())->whereNotNull('path')->each(function ($e) use (&$count) {
        \Illuminate\Support\Facades\Storage::disk('local')->delete($e->path);
        $e->update(['path' => null, 'status' => 'expired']);
        $count++;
    });
    $this->info("Removed {$count} expired export(s).");
})->purpose('Delete data exports older than 7 days');

Schedule::command('exports:purge')->dailyAt('04:00');

// Automatic messages (birthday, anniversary, "we miss you") for live businesses that switched them on.
Artisan::command('marketing:automations', function (TenantContext $context) {
    $features = app(\App\Modules\Plans\Services\FeatureService::class);
    $total = 0;
    foreach (Tenant::where('status', 'live')->where('is_demo', false)->get() as $tenant) {
        if (! $features->enabled($tenant, 'coupons')) {
            continue;
        }
        $sent = $context->run($tenant, fn () => app(\App\Modules\Marketing\Services\Automations::class)->run($tenant));
        $total += array_sum($sent);
    }
    $this->info("Sent {$total} automatic message(s).");
})->purpose('Send birthday, anniversary and win-back messages to opted-in customers');

Schedule::command('marketing:automations')->dailyAt('10:00')->timezone('Asia/Kolkata')->withoutOverlapping();

// Nightly database backup (gzip) under storage/app/private/backups, older ones removed.
// Copy them off the server too (see docs/DEPLOYMENT.md).
Artisan::command('backup:database', function () {
    $c = config('database.connections.'.config('database.default'));
    $dir = storage_path('app/private/backups');
    @mkdir($dir, 0750, true);
    $file = $dir.'/'.$c['database'].'-'.now()->format('Y-m-d-His').'.sql.gz';
    $cmd = [config('dinedesk.backups.mysqldump'), '--single-transaction', '--quick', '--routines', '-h', $c['host'], '-P', (string) $c['port'], '-u', $c['username'], $c['database']];
    $process = new \Symfony\Component\Process\Process($cmd, null, ['MYSQL_PWD' => (string) $c['password']], null, 1800);
    $gz = gzopen($file, 'wb6');
    try {
        $process->run(function ($type, $buffer) use ($gz) {
            if ($type === \Symfony\Component\Process\Process::OUT) {
                gzwrite($gz, $buffer);
            }
        });
    } catch (\Throwable $e) {
        gzclose($gz);
        @unlink($file);
        $this->error('Backup failed: '.$e->getMessage());

        return 1;
    }
    gzclose($gz);
    if (! $process->isSuccessful()) {
        @unlink($file);
        $this->error('Backup failed: '.trim($process->getErrorOutput()));

        return 1;
    }
    $keep = now()->subDays(config('dinedesk.backups.keep_days'))->getTimestamp();
    foreach (glob($dir.'/*.sql.gz') ?: [] as $old) {
        if (filemtime($old) < $keep) {
            @unlink($old);
        }
    }
    $this->info('Backup saved: '.basename($file).' ('.round(filesize($file) / 1024).' KB)');

    return 0;
})->purpose('Back up the database to storage/app/private/backups');

Schedule::command('backup:database')->dailyAt('02:30')->withoutOverlapping();

// Keys for push alerts on staff phones: run once, put the two lines in .env.
Artisan::command('webpush:vapid', function () {
    $keys = \Minishlink\WebPush\VAPID::createVapidKeys();
    $this->line('WEBPUSH_VAPID_PUBLIC='.$keys['publicKey']);
    $this->line('WEBPUSH_VAPID_PRIVATE='.$keys['privateKey']);
    $this->info('Add these to backend/.env (and keep the private key secret).');
})->purpose('Generate VAPID keys for Web Push alerts');
