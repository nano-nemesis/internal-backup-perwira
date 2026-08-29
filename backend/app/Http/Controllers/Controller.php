<?php

namespace App\Http\Controllers;

use Illuminate\Foundation\Auth\Access\AuthorizesRequests;
use Illuminate\Foundation\Validation\ValidatesRequests;
use Illuminate\Routing\Controller as BaseController;
use Illuminate\Validation\Rules\Password;

class Controller extends BaseController
{
    use AuthorizesRequests, ValidatesRequests;

    /**
     * Kebijakan password bersama.
     *
     * uncompromised() memeriksa ke basis data password bocor lewat k-anonymity:
     * hanya 5 karakter awal hash SHA-1 yang dikirim, passwordnya tidak pernah
     * meninggalkan server. Kalau server tidak punya internet, pemeriksaan itu
     * GAGAL TERBUKA — password tetap diterima, jadi pembuatan akun tidak ikut mati.
     */
    protected static function aturanPassword(): Password
    {
        return Password::min(12)->letters()->numbers()->uncompromised();
    }
}
