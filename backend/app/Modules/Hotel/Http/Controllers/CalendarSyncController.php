<?php

namespace App\Modules\Hotel\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Modules\Audit\Models\AuditLog;
use App\Modules\Hotel\Models\RoomCalendarFeed;
use App\Modules\Hotel\Models\RoomType;
use App\Modules\Hotel\Services\CalendarSync;
use App\Modules\Tenancy\Models\Tenant;
use App\Modules\Tenancy\Support\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

/** Calendar sync with booking sites: the private link per room type, and the sites' links. */
class CalendarSyncController extends Controller
{
    public const MAX_FEEDS = 5;

    public function __construct(private readonly TenantContext $context, private readonly CalendarSync $sync) {}

    /** Public: the .ics a booking site reads (the token in the link is the only key). */
    public function export(string $token): Response
    {
        $type = RoomType::withoutTenancy()->where('ical_token', $token)->first();
        abort_unless($type && preg_match('/^[A-Za-z0-9]{40}$/', $token), 404);
        $tenant = Tenant::findOrFail($type->tenant_id);
        $ics = $this->context->run($tenant, fn () => $this->sync->export($tenant, $type));

        return response($ics, 200, ['Content-Type' => 'text/calendar; charset=utf-8', 'Cache-Control' => 'no-cache']);
    }

    public function show(int $id): JsonResponse
    {
        return $this->ok($this->present(RoomType::findOrFail($id)));
    }

    public function addFeed(Request $request, int $id): JsonResponse
    {
        $type = RoomType::findOrFail($id);
        $d = $request->validate([
            'name' => ['required', 'string', 'max:60'],
            'url' => ['required', 'string', 'max:2000', 'url:http,https'],
        ]);
        if (RoomCalendarFeed::where('room_type_id', $type->id)->count() >= self::MAX_FEEDS) {
            return $this->ok($this->present($type), 'A room type can have up to '.self::MAX_FEEDS.' calendar links.', null, 422);
        }
        $this->sync->assertPublic($d['url']);
        $feed = RoomCalendarFeed::create(['room_type_id' => $type->id, 'name' => strip_tags($d['name']), 'url' => $d['url']]);
        AuditLog::record('hotel.calendar_added', $type, ['name' => $feed->name]);
        // Read it straight away, so the owner sees whether the link works.
        $message = 'Calendar link added.';
        try {
            $n = $this->sync->import($this->context->require(), $feed);
            $message = "Calendar link added: {$n} booking(s) from {$feed->name} now hold a room.";
        } catch (\App\Support\ApiException $e) {
            $message = "Calendar link added, but it could not be read yet: {$e->getMessage()}";
        }

        return $this->created($this->present($type), $message);
    }

    public function removeFeed(int $feedId): JsonResponse
    {
        $feed = RoomCalendarFeed::findOrFail($feedId);
        $type = $feed->type;
        $feed->delete();

        return $this->ok($this->present($type), 'Calendar link removed.');
    }

    public function syncNow(int $id): JsonResponse
    {
        $type = RoomType::findOrFail($id);
        $problems = 0;
        foreach (RoomCalendarFeed::where('room_type_id', $type->id)->get() as $feed) {
            try {
                $this->sync->import($this->context->require(), $feed);
            } catch (\App\Support\ApiException) {
                $problems++;
            }
        }

        return $this->ok($this->present($type->fresh()), $problems ? "{$problems} calendar link(s) could not be read." : 'Calendars synced.');
    }

    /** A new private link (the old one stops working), e.g. if it was shared by mistake. */
    public function renewLink(int $id): JsonResponse
    {
        $type = RoomType::findOrFail($id);
        $this->sync->token($type, true);
        AuditLog::record('hotel.calendar_link_renewed', $type, []);

        return $this->ok($this->present($type), 'New calendar link made. Update it on the booking sites.');
    }

    private function present(RoomType $type): array
    {
        return [
            'type_id' => $type->id,
            'export_url' => $this->sync->exportUrl($type),
            'feeds' => RoomCalendarFeed::where('room_type_id', $type->id)->orderBy('id')->get()->map(fn (RoomCalendarFeed $f) => [
                'id' => $f->id, 'name' => $f->name, 'synced_at' => $f->synced_at?->toIso8601String(), 'error' => $f->error, 'events' => $f->events,
                // Only the site is shown: the link itself is a secret.
                'link' => (parse_url($f->url, PHP_URL_HOST) ?: '').'/…',
            ])->values(),
        ];
    }
}
