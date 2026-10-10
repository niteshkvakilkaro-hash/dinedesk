<?php

namespace App\Modules\Hotel\Services;

use App\Models\User;
use App\Modules\Audit\Models\AuditLog;
use App\Modules\Hotel\Models\GuestDocument;
use App\Modules\Hotel\Models\RoomBooking;
use App\Support\ApiException;
use Carbon\CarbonImmutable;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * Guest ID photos, only when the hotel has turned this on. Files are encrypted with the
 * app key before they touch the (private) disk, every upload / view / deletion is written
 * to the audit log with the staff member and IP, and files are deleted automatically a set
 * number of days after check-out.
 */
class GuestDocuments
{
    public const MAX_PER_STAY = 4;

    public function __construct(private readonly HotelSettings $settings) {}

    public function store(RoomBooking $b, UploadedFile $file, string $type, User $by): GuestDocument
    {
        $this->ensureEnabled();
        if (! in_array($b->status, ['confirmed', 'checked_in'], true)) {
            throw new ApiException('ID documents can be added for upcoming or current stays.', 422, 'invalid_transition');
        }
        if (GuestDocument::where('room_booking_id', $b->id)->count() >= self::MAX_PER_STAY) {
            throw new ApiException('Up to '.self::MAX_PER_STAY.' documents per stay.', 422, 'too_many');
        }
        $path = 'guest-documents/'.$b->tenant()->first()->public_id.'/'.Str::lower((string) Str::ulid()).'.bin';
        $this->disk()->put($path, Crypt::encrypt(file_get_contents($file->getRealPath())));
        $keep = (int) $this->settings->get()['id_keep_days'];
        $doc = GuestDocument::create([
            'room_booking_id' => $b->id,
            'doc_type' => $type,
            'path' => $path,
            'mime' => $file->getMimeType() ?? 'application/octet-stream',
            'size' => $file->getSize(),
            'uploaded_by' => $by->id,
            'delete_after' => CarbonImmutable::parse($b->check_out)->addDays($keep)->format('Y-m-d'),
        ]);
        AuditLog::record('guest_id.uploaded', $doc, ['stay' => $b->code, 'type' => $type]);

        return $doc;
    }

    /** The decrypted file, logged. */
    public function read(GuestDocument $doc): array
    {
        $this->ensureEnabled();
        $raw = $this->disk()->get($doc->path);
        if ($raw === null) {
            throw new ApiException('This document is no longer stored.', 404, 'not_found');
        }
        AuditLog::record('guest_id.viewed', $doc, ['stay' => RoomBooking::whereKey($doc->room_booking_id)->value('code'), 'type' => $doc->doc_type]);

        return ['content' => Crypt::decrypt($raw), 'mime' => $doc->mime];
    }

    public function delete(GuestDocument $doc, string $why = 'deleted'): void
    {
        $this->disk()->delete($doc->path);
        AuditLog::record("guest_id.{$why}", $doc, ['stay' => RoomBooking::whereKey($doc->room_booking_id)->value('code'), 'type' => $doc->doc_type], $doc->tenant_id);
        $doc->delete();
    }

    /** Files past their keep date go (scheduled daily). */
    public function purge(): int
    {
        $count = 0;
        GuestDocument::where('delete_after', '<', now()->format('Y-m-d'))->each(function (GuestDocument $d) use (&$count) {
            $this->delete($d, 'auto_deleted');
            $count++;
        });

        return $count;
    }

    private function ensureEnabled(): void
    {
        if (! $this->settings->get()['id_documents']) {
            throw new ApiException('ID document storage is off. The owner can turn it on in Hotel settings.', 422, 'documents_off');
        }
    }

    private function disk()
    {
        return Storage::disk((string) config('dinedesk.guest_documents_disk'));
    }
}
