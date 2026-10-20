<?php

namespace App\Http\Controllers;

use App\Models\ActivityLog;
use App\Models\Setting;
use App\Support\DoctorStandar;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Standar Perwira untuk Doctor: dibaca semua peran, diubah admin. */
class DoctorStandarController extends Controller
{
    public function show(): JsonResponse
    {
        $s = DoctorStandar::tersimpan();

        return response()->json(['data' => [
            'standar' => $s,
            'bawaan'  => DoctorStandar::BAWAAN,
            'layanan' => DoctorStandar::LAYANAN,
            'cek'     => array_map(fn ($id, $c) => ['id' => $id, 'judul' => $c[0], 'kategori' => $c[1], 'berlaku' => $c[2]],
                array_keys(DoctorStandar::CEK), DoctorStandar::CEK),
            'skrip'   => DoctorStandar::skripDasar($s),
            'diubah'  => Setting::find(DoctorStandar::KUNCI)?->updated_at,
        ]]);
    }

    public function update(Request $request): JsonResponse
    {
        $layanan = 'in:' . implode(',', array_keys(DoctorStandar::LAYANAN));
        $v = $request->validate([
            'noc'                => 'array|max:20',
            'noc.*'              => ['string', 'max:43', fn ($a, $nilai, $gagal) => DoctorStandar::alamatSah((string) $nilai)
                ?: $gagal("Alamat NOC \"{$nilai}\" bukan IPv4 atau CIDR yang sah.")],
            'layanan_mati'       => 'array',
            'layanan_mati.*'     => $layanan,
            'layanan_dibatasi'   => 'array',
            'layanan_dibatasi.*' => $layanan,
            'lisensi_min'        => 'required|in:p1,p10,unlimited',
            'kanal'              => 'required|in:ikuti,long-term,stable',
            'ntp'                => 'array|max:4',
            'ntp.*'              => ['string', 'max:253', 'regex:/^[a-z0-9][a-z0-9.-]*$/i'],
            'cpu_maks'           => 'required|integer|min:50|max:100',
            'ram_min'            => 'required|integer|min:1|max:50',
            'disk_min'           => 'required|integer|min:1|max:50',
            'interim'            => ['required', 'string', 'regex:/^(\d+[smhd]?|\d{2}:\d{2}:\d{2})$/'],
            'cek'                => 'array',
            'cek.*.aktif'        => 'boolean',
            'cek.*.tingkat'      => 'in:' . implode(',', DoctorStandar::TINGKAT),
        ], [
            'ntp.*.regex'    => 'Server NTP harus berupa nama host atau IP.',
            'interim.regex'  => 'Interim update ditulis seperti 5m, 300s, atau 00:05:00.',
        ]);

        $baru = DoctorStandar::rapikan($v);
        Setting::put(DoctorStandar::KUNCI, json_encode($baru));

        $mati = array_keys(array_filter($baru['cek'], fn ($c) => ! $c['aktif']));
        ActivityLog::info('pengaturan', 'doctor.standar', 'Standar Doctor diubah'
            . ($mati ? '; pemeriksaan dimatikan: ' . implode(', ', $mati) : '') . '.', ['standar' => $baru]);

        return $this->show();
    }
}
