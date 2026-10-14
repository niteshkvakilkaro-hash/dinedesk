<?php

use App\Modules\DataExport\Models\DataExport;
use App\Modules\Hotel\Models\GuestDocument;
use App\Modules\Hotel\Models\RoomBooking;
use App\Modules\Hotel\Models\RoomCalendarFeed;
use App\Modules\Hotel\Services\CalendarSync;
use App\Modules\Hotel\Services\GuestDocuments;
use App\Modules\Hotel\Services\RoomBookings;
use App\Modules\Marketing\Services\Automations;
use App\Modules\Ordering\Models\Order;
use App\Modules\Ordering\Services\OrderFlow;
use App\Modules\Plans\Services\FeatureService;
use App\Modules\Reports\Services\DailySummary;
use App\Modules\Reservations\Models\Reservation;
use App\Modules\Reservations\Services\Bookings;
use App\Modules\Settings\Models\Setting;
use App\Modules\Settings\Services\TenantSettings;
use App\Modules\Subscriptions\Services\SubscriptionManager;
use App\Modules\Tenancy\Models\Tenant;
use App\Modules\Tenancy\Support\TenantContext;
use App\Modules\Tenancy\Support\TenantResolver;
use App\Modules\Website\Http\Controllers\AndroidAppController;
use App\Support\ApiException;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;
use Illuminate\Support\Facades\Storage;
use Minishlink\WebPush\VAPID;
use Symfony\Component\Process\Process;

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
    $tenantIds = Reservation::withoutTenancy()
        ->where('status', 'confirmed')->whereNull('reminder_sent_at')
        ->whereBetween('starts_at', [now(), now()->addHours(48)])
        ->distinct()->pluck('tenant_id');
    $total = 0;
    foreach (Tenant::whereIn('id', $tenantIds)->get() as $tenant) {
        $total += $context->run($tenant, fn () => app(Bookings::class)->sendReminders());
    }
    $this->info("Sent {$total} booking reminder(s).");
})->purpose('Remind guests of confirmed table bookings');

Schedule::command('reservations:send-reminders')->everyFiveMinutes()->withoutOverlapping();

// Hotel: website bookings whose online advance never came in release their room.
Artisan::command('hotel:expire-holds', function (TenantContext $context) {
    $tenantIds = RoomBooking::withoutTenancy()
        ->where('status', 'pending')->whereNotNull('hold_expires_at')->where('hold_expires_at', '<', now())
        ->distinct()->pluck('tenant_id');
    $total = 0;
    foreach (Tenant::whereIn('id', $tenantIds)->get() as $tenant) {
        $total += $context->run($tenant, fn () => app(RoomBookings::class)->expireHolds());
    }
    $this->info("Released {$total} unpaid room booking(s).");
})->purpose('Cancel room bookings whose advance was never paid');

Schedule::command('hotel:expire-holds')->everyFiveMinutes()->withoutOverlapping();

// Booking sites' calendars (iCal): their bookings hold a room here. A broken link is noted on it.
Artisan::command('hotel:calendar-sync', function (TenantContext $context) {
    $feeds = RoomCalendarFeed::withoutTenancy()->get()->groupBy('tenant_id');
    $read = $failed = 0;
    foreach (Tenant::whereIn('id', $feeds->keys())->get() as $tenant) {
        $context->run($tenant, function () use ($tenant, &$read, &$failed) {
            foreach (RoomCalendarFeed::all() as $feed) {
                try {
                    app(CalendarSync::class)->import($tenant, $feed);
                    $read++;
                } catch (ApiException) {
                    $failed++;
                }
            }
        });
    }
    $this->info("Calendars read: {$read}, could not read: {$failed}.");
})->purpose('Read booking sites\' calendars (iCal) for hotels');

Schedule::command('hotel:calendar-sync')->everyThirtyMinutes()->withoutOverlapping();

// Hotel: guest ID documents are deleted once their keep period after check-out ends.
Artisan::command('hotel:purge-documents', function (TenantContext $context) {
    $tenantIds = GuestDocument::withoutTenancy()
        ->where('delete_after', '<', now()->format('Y-m-d'))->distinct()->pluck('tenant_id');
    $total = 0;
    foreach (Tenant::whereIn('id', $tenantIds)->get() as $tenant) {
        $total += $context->run($tenant, fn () => app(GuestDocuments::class)->purge());
    }
    $this->info("Deleted {$total} guest document(s).");
})->purpose('Delete guest ID documents past their keep date');

Schedule::command('hotel:purge-documents')->dailyAt('03:30')->withoutOverlapping();

// Billing: trials and paid periods that ran out get a grace period, then read-only (hourly).
Artisan::command('subscriptions:enforce', function () {
    $done = app(SubscriptionManager::class)->enforce();
    $this->info("Grace started: {$done['grace']}, made read-only: {$done['read_only']}, referral credits added: {$done['referral_credits']}.");
})->purpose('Start grace periods and apply read-only mode for unpaid businesses');

Schedule::command('subscriptions:enforce')->hourly()->withoutOverlapping();

// Data exports are kept for 7 days.
Artisan::command('exports:purge', function () {
    $count = 0;
    DataExport::withoutTenancy()->where('expires_at', '<', now())->whereNotNull('path')->each(function ($e) use (&$count) {
        Storage::disk('local')->delete($e->path);
        $e->update(['path' => null, 'status' => 'expired']);
        $count++;
    });
    $this->info("Removed {$count} expired export(s).");
})->purpose('Delete data exports older than 7 days');

Schedule::command('exports:purge')->dailyAt('04:00');

// Automatic messages (birthday, anniversary, "we miss you") for live businesses that switched them on.
Artisan::command('marketing:automations', function (TenantContext $context) {
    $features = app(FeatureService::class);
    $total = 0;
    foreach (Tenant::where('status', 'live')->where('is_demo', false)->get() as $tenant) {
        if (! $features->enabled($tenant, 'coupons')) {
            continue;
        }
        $sent = $context->run($tenant, fn () => app(Automations::class)->run($tenant));
        $total += array_sum($sent);
    }
    $this->info("Sent {$total} automatic message(s).");
})->purpose('Send birthday, anniversary and win-back messages to opted-in customers');

Schedule::command('marketing:automations')->dailyAt('10:00')->timezone('Asia/Kolkata')->withoutOverlapping();

// The owner's morning summary of yesterday (WhatsApp / email), for live businesses that switched
// it on. Runs hourly; each business gets it once, at the hour it chose in its own timezone.
Artisan::command('reports:daily-summary', function (TenantContext $context) {
    $sent = 0;
    $tenantIds = Setting::withoutTenancy()->where('key', DailySummary::KEY)->pluck('tenant_id');
    foreach (Tenant::whereIn('id', $tenantIds)->where('status', 'live')->where('is_demo', false)->get() as $tenant) {
        try {
            $sent += (int) $context->run($tenant, fn () => app(DailySummary::class)->runIfDue($tenant));
        } catch (Throwable $e) {
            report($e); // one business's problem never stops the others
        }
    }
    $this->info("Sent {$sent} daily summary(ies).");
})->purpose('Send owners their morning summary of yesterday');

// On the hour in IST (India is UTC+5:30, so a plain UTC hourly run would land at :30).
Schedule::command('reports:daily-summary')->hourly()->timezone('Asia/Kolkata')->withoutOverlapping();

// Nightly database backup (gzip) under storage/app/private/backups, older ones removed.
// Copy them off the server too (see docs/DEPLOYMENT.md).
Artisan::command('backup:database', function () {
    $c = config('database.connections.'.config('database.default'));
    $dir = storage_path('app/private/backups');
    @mkdir($dir, 0750, true);
    $file = $dir.'/'.$c['database'].'-'.now()->format('Y-m-d-His').'.sql.gz';
    $cmd = [config('dinedesk.backups.mysqldump'), '--single-transaction', '--quick', '--routines', '-h', $c['host'], '-P', (string) $c['port'], '-u', $c['username'], $c['database']];
    $process = new Process($cmd, null, ['MYSQL_PWD' => (string) $c['password']], null, 1800);
    $gz = gzopen($file, 'wb6');
    try {
        $process->run(function ($type, $buffer) use ($gz) {
            if ($type === Process::OUT) {
                gzwrite($gz, $buffer);
            }
        });
    } catch (Throwable $e) {
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
    $keys = VAPID::createVapidKeys();
    $this->line('WEBPUSH_VAPID_PUBLIC='.$keys['publicKey']);
    $this->line('WEBPUSH_VAPID_PRIVATE='.$keys['privateKey']);
    $this->info('Add these to backend/.env (and keep the private key secret).');
})->purpose('Generate VAPID keys for Web Push alerts');

// Links a business website to its Android app (Trusted Web Activity) for /.well-known/assetlinks.json.
Artisan::command('android:app {host : The website host, e.g. hungryhaveli.in} {package? : Android package name, e.g. in.hungryhaveli.app} {sha256?* : SHA-256 signing-key fingerprints} {--clear}', function (TenantContext $context) {
    $resolver = app(TenantResolver::class);
    $tenant = $resolver->resolve(strtolower($this->argument('host')));
    if (! $tenant) {
        $this->error('No business website at that host.');

        return 1;
    }
    $settings = fn () => app(TenantSettings::class);
    if ($this->option('clear')) {
        $context->run($tenant, fn () => $settings()->set(AndroidAppController::SETTING, null));
        $this->info("Removed the Android app link for {$tenant->name}.");

        return 0;
    }
    $package = (string) $this->argument('package');
    $prints = array_map('strtoupper', $this->argument('sha256'));
    if (! preg_match('/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/i', $package) || ! $prints
        || array_filter($prints, fn ($p) => ! preg_match('/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/', $p))) {
        $this->error('Give a package name (like in.hungryhaveli.app) and at least one fingerprint (AB:CD:... 32 pairs).');

        return 1;
    }
    $context->run($tenant, fn () => $settings()->set(AndroidAppController::SETTING, ['package' => $package, 'sha256' => $prints]));
    $this->info("{$tenant->name} → {$package}. Check https://{$this->argument('host')}/.well-known/assetlinks.json");

    return 0;
})->purpose('Link a business website to its Android app');
