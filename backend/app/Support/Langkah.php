<?php

namespace App\Support;

/** Pencatat hasil uji backup langkah demi langkah (ok | peringatan | gagal). */
final class Langkah
{
    private array $daftar = [];

    /** @return bool false kalau gagal, supaya pemanggil bisa berhenti: if (!$l->catat(...)) return */
    public function catat(string $status, string $judul, string $detail): bool
    {
        $this->daftar[] = compact('status', 'judul', 'detail');

        return $status !== 'gagal';
    }

    /** @return array{status: string, langkah: array} */
    public function hasil(): array
    {
        return ['status' => VerifikasiBerkas::terburuk($this->daftar), 'langkah' => $this->daftar];
    }
}
