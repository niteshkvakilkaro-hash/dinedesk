<?php

namespace App\Modules\DataExport\Services;

use App\Modules\DataExport\Models\DataExport;
use App\Modules\Tenancy\Models\Tenant;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use ZipArchive;

/**
 * Everything a business has on the platform, as a ZIP: one JSON file per table (every row
 * with its tenant_id), plus CSVs of orders, customers and the menu that open in Excel.
 * Secrets stay out: passwords, sign-in tokens, payment keys, stored file paths. Guest ID
 * files are not included (only that they exist).
 */
class TenantExporter
{
    /** Never exported: platform internals or other people's sessions. */
    private const SKIP_TABLES = ['personal_access_tokens', 'sessions', 'cache', 'cache_locks', 'jobs', 'failed_jobs', 'job_batches', 'password_reset_tokens', 'data_exports', 'support_sessions', 'otp_codes', 'notifications'];

    /** Columns removed wherever they appear. */
    private const SECRET_COLUMNS = ['password', 'remember_token', 'access_token', 'tracking_token', 'qr_token', 'unsubscribe_token', 'path', 'code_hash'];

    public function build(Tenant $tenant, DataExport $export): void
    {
        $disk = Storage::disk('local');
        $dir = "exports/{$tenant->public_id}";
        $disk->makeDirectory($dir);
        $relative = "{$dir}/{$export->public_id}.zip";
        $zip = new ZipArchive();
        if ($zip->open($disk->path($relative), ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
            throw new \RuntimeException('Could not create the export file.');
        }

        $tables = [];
        foreach ($this->tenantTables() as $table) {
            $rows = DB::table($table)->where('tenant_id', $tenant->id)->orderBy(Schema::hasColumn($table, 'id') ? 'id' : 'tenant_id')->get()
                ->map(fn ($r) => $this->clean($table, (array) $r))->all();
            $zip->addFromString("data/{$table}.json", json_encode($rows, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
            $tables[$table] = count($rows);
        }
        $zip->addFromString('data/business.json', json_encode($this->clean('tenants', $tenant->getAttributes()), JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));

        $this->csv($zip, 'orders.csv', ['Order', 'Placed (UTC)', 'Type', 'Status', 'Customer', 'Phone', 'Total', 'Payment', 'Payment status'],
            DB::table('orders')->where('tenant_id', $tenant->id)->orderBy('id')->get()->map(fn ($o) => [$o->number, $o->placed_at, $o->type, $o->status, $o->customer_name, $o->customer_phone, $o->total, $o->payment_method, $o->payment_status]));
        $this->csv($zip, 'customers.csv', ['Name', 'Phone', 'Email', 'Orders', 'Visits', 'Total spent', 'Offers opt-in'],
            DB::table('customers')->where('tenant_id', $tenant->id)->orderBy('id')->get()->map(fn ($c) => [$c->name, $c->phone, $c->email, $c->orders_count, $c->visits ?? 0, $c->total_spent ?? 0, ! empty($c->marketing_opt_in) ? 'yes' : 'no']));
        $this->csv($zip, 'menu.csv', ['Category', 'Dish', 'Price', 'GST %', 'Veg / non-veg', 'Available'],
            DB::table('menu_items')->join('menu_categories', 'menu_categories.id', '=', 'menu_items.menu_category_id')->where('menu_items.tenant_id', $tenant->id)->whereNull('menu_items.deleted_at')
                ->orderBy('menu_categories.sort_order')->orderBy('menu_items.sort_order')->get(['menu_categories.name as category', 'menu_items.name', 'menu_items.price', 'menu_items.tax_rate', 'menu_items.food_type', 'menu_items.is_available'])
                ->map(fn ($m) => [$m->category, $m->name, $m->price, $m->tax_rate, $m->food_type, $m->is_available ? 'yes' : 'no']));

        $zip->addFromString('README.txt', implode("\n", [
            "Data export for {$tenant->name}",
            'Created: '.now()->toIso8601String(),
            '',
            'csv/   — orders, customers and menu (open in Excel or Google Sheets).',
            'data/  — every record of the business as JSON, one file per table.',
            '',
            'Not included for safety: passwords, sign-in tokens, payment keys and guest ID files.',
            '',
            'Rows per table:',
            ...array_map(fn ($t, $n) => "  {$t}: {$n}", array_keys($tables), $tables),
        ]));
        $zip->close();

        $export->update(['status' => 'ready', 'path' => $relative, 'size' => $disk->size($relative), 'expires_at' => now()->addDays(DataExport::KEEP_DAYS)]);
    }

    /** Tables holding business data (they have a tenant_id column). @return list<string> */
    public function tenantTables(): array
    {
        $db = DB::getDatabaseName();
        $tables = collect(DB::select('SELECT TABLE_NAME AS t FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND COLUMN_NAME = ?', [$db, 'tenant_id']))->pluck('t');

        return $tables->reject(fn ($t) => in_array($t, self::SKIP_TABLES, true))->sort()->values()->all();
    }

    private function clean(string $table, array $row): array
    {
        foreach (self::SECRET_COLUMNS as $c) {
            unset($row[$c]);
        }
        if ($table === 'settings' && isset($row['key']) && str_contains((string) $row['key'], 'razorpay')) {
            $row['value'] = null;
        }

        return $row;
    }

    private function csv(ZipArchive $zip, string $name, array $head, iterable $rows): void
    {
        $out = fopen('php://temp', 'w+');
        fwrite($out, "\xEF\xBB\xBF");
        fputcsv($out, $head);
        foreach ($rows as $row) {
            fputcsv($out, array_map(fn ($v) => is_string($v) && preg_match('/^[=+\-@]/', $v) ? "'".$v : $v, $row));
        }
        rewind($out);
        $zip->addFromString("csv/{$name}", stream_get_contents($out));
        fclose($out);
    }
}
