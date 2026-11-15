<?php

namespace App\Console\Commands;

use App\Services\Moderation\ModerationCatalog;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\HttpException;

class ReconcileModeratedPlaces extends Command
{
    protected $signature = 'moderation:reconcile';

    protected $description = 'Apply approved place changes and restore expired temporary changes';

    public function handle(ModerationCatalog $catalog): int
    {
        $conflicts = 0;
        DB::table('moderation_place_states')->orderBy('place_id')->chunkById(100, function ($states) use ($catalog, &$conflicts) {
            foreach ($states as $state) {
                try {
                    DB::transaction(function () use ($state, $catalog) {
                        $place = DB::table('places')->where('id', $state->place_id)->lockForUpdate()->first();
                        if ($place) {
                            $catalog->reconcile($place);
                        }
                    }, 3);
                } catch (HttpException $error) {
                    if ($error->getStatusCode() !== 409) {
                        throw $error;
                    }
                    $conflicts++;
                    $this->error('Conflict at internal place ID '.$state->place_id.'. Reconcile the source change before retrying.');
                }
            }
        }, 'place_id');

        return $conflicts ? self::FAILURE : self::SUCCESS;
    }
}
