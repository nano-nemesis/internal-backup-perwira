<?php

namespace App\Support;

/**
 * Kebijakan perintah RouterOS untuk terminal remote.
 *
 * Sengaja tanpa dependensi Laravel supaya bisa diuji langsung dengan `php` polos:
 *   php tests/router-os-command-policy.php
 */
class RouterOsCommandPolicy
{
    /**
     * Verb yang mengubah keadaan router. Dicocokkan sebagai kata utuh, jadi
     * `disabled=yes` pada filter print tetap lolos sementara `disable` ditolak.
     *
     * ponytail: ini daftar-TOLAK, bukan allowlist — sintaks tak terduga (singkatan
     * RouterOS, `:execute` di scripting) bisa lolos. Kalau terminal ini dipakai lebih
     * luas, ganti ke allowlist prefix default-deny.
     */
    private const DESTRUCTIVE = '/\b(remove|reset-configuration|disable|shutdown|set|upgrade)\b/i';

    public static function isDestructive(string $command): bool
    {
        return preg_match(self::DESTRUCTIVE, $command) === 1;
    }
}
