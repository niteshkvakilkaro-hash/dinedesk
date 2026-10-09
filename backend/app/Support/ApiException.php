<?php

namespace App\Support;

use RuntimeException;

/**
 * A business-rule failure with an HTTP status and a stable machine-readable
 * code for the frontend (e.g. "plan_limit", "onboarding_required").
 * Rendered as { data: null, message, errors: null, meta: { code, ... } }.
 */
class ApiException extends RuntimeException
{
    public function __construct(
        string $message,
        public readonly int $status = 400,
        public readonly string $errorCode = 'error',
        public readonly array $meta = [],
    ) {
        parent::__construct($message);
    }
}
