<?php

use App\Modules\Identity\Http\Middleware\RequireTenantPermission;
use App\Modules\Platform\Http\Middleware\EnsurePlatformAdmin;
use App\Modules\Plans\Http\Middleware\RequireFeature;
use App\Modules\Tenancy\Http\Middleware\ResolveTenantFromHost;
use App\Modules\Tenancy\Http\Middleware\UseUserTenant;
use App\Support\ApiException;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Exceptions\ThrottleRequestsException;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Spatie\Permission\Exceptions\UnauthorizedException as PermissionDenied;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->alias([
            'tenant.host' => ResolveTenantFromHost::class,
            'tenant.user' => UseUserTenant::class,
            'platform.admin' => EnsurePlatformAdmin::class,
            'feature' => RequireFeature::class,
            // Spatie's own permission middleware assumes the session guard; tenant.can checks
            // the token user's permissions inside their business instead.
            'tenant.can' => RequireTenantPermission::class,
        ]);
        $middleware->redirectGuestsTo(fn (Request $request) => $request->is('api/*') ? null : '/');
        // Only trust X-Forwarded-* from listed proxies (keeps rate limits spoof-proof).
        if ($proxies = env('TRUSTED_PROXIES')) {
            $middleware->trustProxies(at: $proxies === '*' ? '*' : explode(',', $proxies));
        }
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(fn (Request $request) => $request->is('api/*') || $request->expectsJson());

        $json = fn (int $status, string $message, $errors = null, ?array $meta = null, array $headers = []) => response()->json(
            ['data' => null, 'message' => $message, 'errors' => $errors, 'meta' => $meta],
            $status,
            $headers,
        );

        $exceptions->render(function (Throwable $e, Request $request) use ($json) {
            if (! $request->is('api/*')) {
                return null;
            }

            return match (true) {
                $e instanceof ApiException => $json(
                    $e->status,
                    $e->getMessage(),
                    isset($e->meta['field']) ? [$e->meta['field'] => [$e->getMessage()]] : null,
                    ['code' => $e->errorCode] + $e->meta,
                ),
                $e instanceof ValidationException => $json(422, collect($e->errors())->flatten()->first() ?? 'Please check the highlighted fields.', $e->errors(), ['code' => 'validation']),
                $e instanceof AuthenticationException => $json(401, 'Please sign in to continue.', null, ['code' => 'unauthenticated']),
                $e instanceof PermissionDenied,
                $e instanceof AuthorizationException,
                $e instanceof AccessDeniedHttpException => $json(403, 'You do not have permission to do that.', null, ['code' => 'forbidden']),
                $e instanceof ModelNotFoundException,
                $e instanceof NotFoundHttpException => $json(404, 'Not found.', null, ['code' => 'not_found']),
                $e instanceof ThrottleRequestsException => $json(429, 'Too many attempts. Please wait a moment and try again.', null, ['code' => 'throttled'], $e->getHeaders()),
                $e instanceof HttpExceptionInterface => $json($e->getStatusCode(), $e->getMessage() ?: 'Request failed.', null, null, $e->getHeaders()),
                default => config('app.debug') ? null : $json(500, 'Something went wrong on our side. Please try again.'),
            };
        });
    })->create();
