<?php

namespace App\Traits;

use Carbon\Carbon;

trait HasAlignedSchedule
{
    /**
     * Hitung next aligned slot setelah backup selesai.
     * Return slot jam bulat berikutnya yang aligned ke midnight WIB.
     */
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

        // Tidak ada slot hari ini → besok jam 00:00 WIB
        return $midnight->copy()->addDay()->utc();
    }

    /**
     * Hitung slot pertama untuk node baru.
     * Selalu return besok jam 00:00 WIB — tidak peduli jam berapa node ditambahkan.
     */
    protected function getFirstSlot(int $intervalHours): Carbon
    {
        $now = Carbon::now('Asia/Jakarta');
        $tomorrowMidnight = $now->copy()->startOfDay()->addDay();
        return $tomorrowMidnight->utc();
    }
}
