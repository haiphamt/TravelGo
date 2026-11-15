<?php

namespace App\Contracts;

interface ItinerarySuggestionProvider
{
    /** Return ordered public place IDs from the bounded, server-filtered catalog only. */
    public function suggest(array $catalog, array $input): array;
}
