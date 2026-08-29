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
        // Dikembalikan dalam zona waktu aplikasi, tanpa konversi UTC manual.
        //
        // config('app.timezone') = 'Asia/Jakarta', jadi Eloquent menulis Carbon apa
        // adanya menurut timezone instance-nya, lalu MEMBACANYA kembali sebagai WIB.
        // Mengonversi ke UTC lebih dulu membuat angka UTC tersimpan tapi ditafsirkan
        // sebagai WIB — jadwal meleset persis sebesar offset (backup jalan 17:00 WIB,
        // bukan 00:00 WIB). Biarkan Laravel yang mengurus konversinya.
        $now = Carbon::now(config('app.timezone'));
        $midnight = $now->copy()->startOfDay();

        for ($h = 0; $h < 24; $h += $intervalHours) {
            $slot = $midnight->copy()->addHours($h);
            if ($slot->isAfter($now)) {
                return $slot;
            }
        }

        // Tidak ada slot hari ini → besok jam 00:00 WIB
        return $midnight->copy()->addDay();
    }

    /**
     * Hitung slot pertama untuk node baru.
     * Selalu return besok jam 00:00 WIB — tidak peduli jam berapa node ditambahkan.
     */
    protected function getFirstSlot(int $intervalHours): Carbon
    {
        $now = Carbon::now(config('app.timezone'));

        return $now->copy()->startOfDay()->addDay();
    }
}
