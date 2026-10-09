<?php

namespace App\Providers;

use App\Modules\Plans\Services\FeatureService;
use App\Modules\Tenancy\Support\TenantContext;
use App\Support\Messaging\LogMessenger;
use App\Support\Messaging\Messenger;
use App\Support\Messaging\MessengerChannel;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Support\Facades\Notification;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /** Business modules; each may ship a routes.php mounted under /api/v1. */
    public const MODULES = ['Identity', 'Onboarding', 'Settings', 'Plans', 'Platform', 'Website', 'Menu', 'Ordering'];

    public function register(): void
    {
        // One tenant context and one feature resolver per request (scoped, so
        // queue workers and long-running servers start each job/request clean).
        $this->app->scoped(TenantContext::class);
        $this->app->scoped(FeatureService::class);

        $this->app->bind(Messenger::class, fn () => match (config('dinedesk.messaging.driver')) {
            default => new LogMessenger(),
        });
    }

    public function boot(): void
    {
        JsonResource::withoutWrapping();
        foreach (['whatsapp', 'sms'] as $channel) {
            Notification::extend($channel, fn ($app) => new MessengerChannel($app->make(Messenger::class), $channel));
        }
        $this->rateLimits();
        $this->moduleRoutes();
    }

    private function moduleRoutes(): void
    {
        foreach (self::MODULES as $module) {
            $file = app_path("Modules/{$module}/routes.php");
            if (is_file($file)) {
                Route::prefix('api/v1')->middleware('api')->group($file);
            }
        }
    }

    private function rateLimits(): void
    {
        $tooMany = fn (string $message) => fn (Request $request, array $headers) => response()->json(
            ['data' => null, 'message' => $message, 'errors' => null, 'meta' => ['code' => 'throttled']],
            429,
            $headers,
        );

        RateLimiter::for('login', fn (Request $request) => [
            Limit::perMinute(5)->by('login|'.strtolower((string) $request->input('email')).'|'.$request->ip())
                ->response($tooMany('Too many sign-in attempts. Please wait a minute.')),
            Limit::perMinute(20)->by('login-ip|'.$request->ip()),
        ]);

        RateLimiter::for('register', fn (Request $request) => Limit::perHour(10)->by($request->ip())
            ->response($tooMany('Too many sign-ups from this network. Please try again later.')));

        RateLimiter::for('otp-send', fn (Request $request) => [
            Limit::perHour(5)->by('otp-phone|'.preg_replace('/\D+/', '', (string) $request->input('phone')))
                ->response($tooMany('Too many codes requested for this number. Please try again later.')),
            Limit::perHour(20)->by('otp-ip|'.$request->ip()),
        ]);

        RateLimiter::for('otp-verify', fn (Request $request) => Limit::perMinutes(10, 10)
            ->by('otp-verify|'.preg_replace('/\D+/', '', (string) $request->input('phone')).'|'.$request->ip()));

        // Public order placement: a few per minute per visitor (and per phone number).
        RateLimiter::for('orders', fn (Request $request) => [
            Limit::perMinute(6)->by('orders-ip|'.$request->ip())
                ->response($tooMany('Too many orders from this network. Please wait a minute.')),
            Limit::perHour(20)->by('orders-phone|'.preg_replace('/\D+/', '', (string) $request->input('customer.phone'))),
        ]);

        RateLimiter::for('webhooks', fn (Request $request) => Limit::perMinute(120)->by($request->ip()));

        RateLimiter::for('api', fn (Request $request) => Limit::perMinute(240)->by($request->user()?->id ?: $request->ip()));
    }
}
