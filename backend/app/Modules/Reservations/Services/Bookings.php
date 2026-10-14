<?php

namespace App\Modules\Reservations\Services;

use App\Models\User;
use App\Modules\Audit\Models\AuditLog;
use App\Modules\Ordering\Models\Customer;
use App\Modules\Reservations\Models\Reservation;
use App\Modules\Reservations\Notifications\NewReservationForStaff;
use App\Modules\Reservations\Notifications\ReservationNotifier;
use App\Modules\Tables\Models\DiningTable;
use App\Modules\Tenancy\Models\Tenant;
use App\Support\ApiException;
use App\Support\Locale;
use App\Support\Phone;
use App\Support\Realtime\Live;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;

/**
 * Table bookings: pending → confirmed → seated → completed,
 * or rejected / cancelled (guest or staff) / no-show.
 */
class Bookings
{
    public const TRANSITIONS = [
        'pending' => ['confirmed', 'rejected', 'cancelled'],
        'confirmed' => ['seated', 'cancelled', 'no_show'],
        'seated' => ['completed'],
        'completed' => [],
        'rejected' => [],
        'cancelled' => [],
        'no_show' => [],
    ];

    private const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

    public function __construct(
        private readonly ReservationSettings $settings,
        private readonly Availability $availability,
        private readonly ReservationNotifier $notifier,
    ) {}

    /**
     * Website bookings follow every rule. Staff bookings (phone / walk-in) are confirmed
     * straight away and may go over capacity with $force (the staff member decides).
     */
    public function create(Tenant $tenant, array $data, string $source = 'website', ?User $by = null, bool $force = false, string $locale = 'en'): Reservation
    {
        $s = $this->settings->get();
        $party = (int) $data['party_size'];
        $website = $source === 'website';

        if ($website && ! $s['enabled']) {
            throw new ApiException('Online table booking is not available right now. Please call us.', 422, 'not_accepting');
        }
        if ($website && ($party < $s['min_party'] || $party > $s['max_party'])) {
            throw new ApiException("Online bookings are for {$s['min_party']} to {$s['max_party']} guests. For larger groups, please call us.", 422, 'party_size', ['field' => 'party_size']);
        }

        $reservation = DB::transaction(function () use ($tenant, $data, $source, $by, $force, $locale, $s, $party, $website) {
            // One booking at a time per business, so two guests can't take the last place together.
            Tenant::whereKey($tenant->id)->lockForUpdate()->first();

            $day = $this->availability->forDate($tenant, $data['date'], $party, null, $s);
            if ($day['problem'] && ! $force) {
                throw new ApiException($day['problem']['message'], 422, $day['problem']['code'], ['field' => 'date']);
            }
            $slot = collect($day['slots'])->firstWhere('time', $data['time']);
            if (! $slot && ! $force) {
                throw new ApiException('Please pick one of the available times.', 422, 'invalid_time', ['field' => 'time']);
            }
            if ($slot && ! $slot['available'] && ! $force) {
                throw new ApiException(Availability::reasonMessage($slot['reason'], $party), 422, $slot['reason'], ['field' => 'time']);
            }

            $start = CarbonImmutable::createFromFormat('Y-m-d H:i', "{$data['date']} {$data['time']}", $tenant->timezone)->utc();
            $phone = Phone::normalize($data['phone']);
            $customer = Customer::firstOrNew(['phone' => $phone]);
            $customer->fill(['name' => strip_tags($data['name']), 'email' => $data['email'] ?? $customer->email])->save();

            return Reservation::create([
                'code' => $this->newCode(),
                'customer_id' => $customer->id,
                'name' => strip_tags($data['name']),
                'phone' => $phone,
                'email' => $data['email'] ?? null,
                'party_size' => $party,
                'date' => $data['date'],
                'time' => $data['time'],
                'starts_at' => $start,
                'ends_at' => $start->addMinutes($s['duration_minutes']),
                'dining_table_id' => $data['dining_table_id'] ?? $slot['table_id'] ?? null,
                'status' => $website && ! $s['auto_confirm'] ? 'pending' : 'confirmed',
                'source' => $source,
                'notes' => isset($data['notes']) ? strip_tags($data['notes']) : null,
                'decided_at' => $website && ! $s['auto_confirm'] ? null : now(),
                'decided_by' => $by?->id,
                'locale' => Locale::guest($locale),
            ]);
        });

        if ($website) {
            $staff = User::where('tenant_id', $tenant->id)->where('status', 'active')->get()
                ->filter(fn (User $u) => in_array('reservations.manage', $u->tenantPermissions(), true));
            Notification::send($staff, new NewReservationForStaff($reservation));
        }
        $this->notifier->send($reservation, $reservation->status === 'pending' ? 'received' : 'confirmed');
        $this->emit($reservation);

        return $reservation->fresh('table');
    }

    /** Staff move a booking on. */
    public function transition(Reservation $r, string $to, ?User $by, ?string $note = null): Reservation
    {
        if (! in_array($to, self::TRANSITIONS[$r->status] ?? [], true)) {
            throw new ApiException("A booking that is {$this->label($r->status)} can't be marked {$this->label($to)}.", 422, 'invalid_transition');
        }
        if ($to === 'no_show' && now()->lt($r->starts_at)) {
            throw new ApiException('You can mark a no-show once the booking time has passed.', 422, 'too_early');
        }
        if ($to === 'confirmed') {
            // Still a free place (and table)? Another booking may have taken it meanwhile.
            $this->ensureStillFits($r);
        }

        $changes = ['status' => $to, 'decided_by' => $by?->id];
        if (in_array($to, ['confirmed', 'rejected'], true)) {
            $changes['decided_at'] = now();
        }
        if ($to === 'cancelled') {
            $changes['cancelled_by'] = 'staff';
        }
        if ($note !== null && $note !== '') {
            $changes['staff_note'] = strip_tags($note);
        }
        $r->update($changes);
        if ($to === 'completed') {
            app(\App\Modules\Crm\Services\CustomerActivity::class)->bookingVisited($r->customer_id);
        }
        if (in_array($to, ['rejected', 'cancelled', 'no_show'], true)) {
            AuditLog::record("reservation.{$to}", $r, ['code' => $r->code, 'note' => $note]);
        }

        match ($to) {
            'confirmed' => $this->notifier->send($r, 'confirmed'),
            'rejected' => $this->notifier->send($r, 'rejected', $note),
            'cancelled' => $this->notifier->send($r, 'cancelled', $note),
            default => null,
        };
        $this->emit($r);

        return $r->fresh('table');
    }

    /** The guest cancels with their booking ID and phone number. */
    public function cancelByGuest(Reservation $r): Reservation
    {
        if (! in_array($r->status, ['pending', 'confirmed'], true)) {
            throw new ApiException('This booking can no longer be cancelled online.', 422, 'not_cancellable');
        }
        if (now()->gte($r->starts_at)) {
            throw new ApiException('The booking time has passed. Please call us.', 422, 'not_cancellable');
        }
        $r->update(['status' => 'cancelled', 'cancelled_by' => 'guest']);
        $this->emit($r);
        $this->notifier->send($r, 'cancelled');

        return $r->fresh('table');
    }

    /** Staff choose (or clear) the table for a booking. */
    public function assignTable(Reservation $r, ?int $tableId): Reservation
    {
        if ($tableId) {
            $table = DiningTable::findOrFail($tableId);
            if ($table->seats < $r->party_size) {
                throw new ApiException("{$table->label} seats {$table->seats}; this booking is for {$r->party_size}.", 422, 'table_too_small', ['field' => 'dining_table_id']);
            }
            $clash = Reservation::whereKeyNot($r->id)->whereIn('status', Reservation::HOLDING)->where('dining_table_id', $tableId)
                ->where('starts_at', '<', $r->ends_at)->where('ends_at', '>', $r->starts_at)->first();
            if ($clash) {
                throw new ApiException("{$table->label} is already booked then ({$clash->name}, {$clash->time}).", 422, 'table_taken', ['field' => 'dining_table_id']);
            }
        }
        $r->update(['dining_table_id' => $tableId]);

        return $r->fresh('table');
    }

    /** Reminder messages for confirmed bookings starting soon. */
    public function sendReminders(): int
    {
        $s = $this->settings->get();
        if (! $s['reminder_hours']) {
            return 0;
        }
        $count = 0;
        Reservation::where('status', 'confirmed')->whereNull('reminder_sent_at')
            ->where('starts_at', '>', now())
            ->where('starts_at', '<=', now()->addHours($s['reminder_hours']))
            // Booked only minutes ago? The confirmation is enough.
            ->where('decided_at', '<', now()->subMinutes(30))
            ->each(function (Reservation $r) use (&$count) {
                $r->update(['reminder_sent_at' => now()]);
                $this->notifier->send($r, 'reminder');
                $count++;
            });

        return $count;
    }

    private function ensureStillFits(Reservation $r): void
    {
        $s = $this->settings->get();
        $tenant = $r->tenant()->first();
        $slotCapacity = collect($this->availability->slotsFor(strtolower($r->starts_at->setTimezone($tenant->timezone)->format('D')), $s))->firstWhere('time', $r->time)['capacity'] ?? null;
        if ($slotCapacity !== null) {
            $booked = (int) Reservation::whereKeyNot($r->id)->whereIn('status', ['confirmed', 'seated'])
                ->whereDate('date', $r->date->format('Y-m-d'))->where('time', $r->time)->sum('party_size');
            if ($booked + $r->party_size > $slotCapacity) {
                throw new ApiException("Confirming this would go over the {$slotCapacity} guests set for {$r->time}. Change the slot capacity or reject the booking.", 422, 'over_capacity');
            }
        }
    }

    private function newCode(): string
    {
        do {
            $code = '';
            for ($i = 0; $i < 6; $i++) {
                $code .= self::CODE_ALPHABET[random_int(0, strlen(self::CODE_ALPHABET) - 1)];
            }
        } while (Reservation::where('code', $code)->exists());

        return $code;
    }

    private function emit(Reservation $r): void
    {
        Live::emit($r->tenant_id, 'reservations', 'reservation.changed', ['id' => $r->id, 'status' => $r->status]);
    }

    private function label(string $status): string
    {
        return str_replace('_', ' ', $status);
    }
}
