<?php

namespace App\Traits;

use Carbon\Carbon;

trait HasAlignedSchedule
{
    protected function getNextAlignedSlot(int $intervalHours): Carbon
    {
        $now = Carbon::now('Asia/Jakarta');
        $midnight = $now->copy()->startOfDay();

        for ($h = 0; $h < 24; $h += $intervalHours) {
            $slot = $midnight->copy()->addHours($h);
            if ($slot->isAfter($now)) {
                return $slot->utc();
            }
        }

        return $midnight->copy()->addDay()->utc();
    }
}
