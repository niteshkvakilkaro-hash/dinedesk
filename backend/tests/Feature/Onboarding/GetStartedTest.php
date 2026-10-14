<?php

namespace Tests\Feature\Onboarding;

use Tests\TestCase;

/** The dashboard "Get started" list: hiding it is remembered for the business, on the server. */
class GetStartedTest extends TestCase
{
    public function test_owner_hides_it_for_the_business_and_others_cannot(): void
    {
        $tenant = $this->business();
        $other = $this->business('Beta Dhaba');
        $owner = $this->ownerOf($tenant);

        $this->actingAsUser($owner)->getJson('/api/v1/tenant/business')->assertOk()->assertJsonPath('data.get_started_hidden', false);
        $this->putJson('/api/v1/tenant/business/get-started', ['hidden' => 'maybe'])->assertStatus(422)->assertJsonValidationErrors('hidden');
        $this->putJson('/api/v1/tenant/business/get-started', ['hidden' => true])->assertOk()->assertJsonPath('data.get_started_hidden', true);
        $this->getJson('/api/v1/tenant/business')->assertJsonPath('data.get_started_hidden', true);

        // Per business: the other business still sees its list.
        $this->actingAsUser($this->ownerOf($other))->getJson('/api/v1/tenant/business')->assertJsonPath('data.get_started_hidden', false);

        // Same permission as the list itself (business.manage).
        $this->actingAsUser($this->staff($tenant, 'waiter'))->putJson('/api/v1/tenant/business/get-started', ['hidden' => false])->assertForbidden();
        $this->putJson('/api/v1/tenant/business/get-started', ['hidden' => false])->assertForbidden();
        $this->actingAsUser($owner)->putJson('/api/v1/tenant/business/get-started', ['hidden' => false])->assertOk()->assertJsonPath('data.get_started_hidden', false);
    }
}
