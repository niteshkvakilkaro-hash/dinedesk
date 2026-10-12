<?php

namespace Tests\Feature\Platform;

use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class SchemaTest extends TestCase
{
    /**
     * MariaDB gives the first non-null TIMESTAMP column of a table ON UPDATE CURRENT_TIMESTAMP,
     * which silently moved expiry times to "now" whenever a row changed (sign-in codes,
     * support sessions). Expiry-style columns must be DATETIME (or nullable).
     */
    public function test_no_column_changes_itself_when_a_row_is_updated(): void
    {
        if (DB::getDriverName() !== 'mysql' && DB::getDriverName() !== 'mariadb') {
            $this->markTestSkipped('MySQL / MariaDB only');
        }
        $columns = collect(DB::select("select table_name as t, column_name as c from information_schema.columns where table_schema = database() and extra like '%on update%'"))
            ->map(fn ($r) => "{$r->t}.{$r->c}")->all();

        $this->assertSame([], $columns);
    }
}
