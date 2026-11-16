<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Contribution extends Model
{
    public $incrementing = false;

    protected $keyType = 'string';

    protected $guarded = [];

    protected $dateFormat = 'Y-m-d H:i:s.u';

    protected function casts(): array
    {
        return ['payload' => 'array', 'snapshot' => 'array', 'version' => 'integer', 'approved_at' => 'immutable_datetime'];
    }
}
