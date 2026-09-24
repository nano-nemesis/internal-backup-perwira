<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;

/**
 * Penyimpanan pengaturan sederhana yang bisa disunting lewat UI.
 *
 * Selalu jatuh kembali ke config()/.env kalau kuncinya belum pernah disimpan,
 * supaya instalasi lama yang masih mengandalkan .env tetap berjalan apa adanya.
 */
class Setting extends Model
{
    protected $primaryKey = 'key';
    public $incrementing = false;
    protected $keyType = 'string';

    protected $fillable = ['key', 'value', 'is_encrypted'];
    protected $casts = ['is_encrypted' => 'boolean'];

    private const CACHE_PREFIX = 'setting:';

    public static function get(string $key, mixed $default = null): mixed
    {
        // Yang di-cache hanya nilai dari DB. $default (config/.env) sengaja di luar
        // cache: kalau ikut disimpan, perubahan .env baru terasa setelah cache kedaluwarsa.
        // null tidak disimpan Cache::remember, jadi kunci kosong selalu dibaca ulang.
        return Cache::remember(self::CACHE_PREFIX . $key, 300, function () use ($key) {
            $row = static::find($key);
            if (! $row || $row->value === null || $row->value === '') {
                return null;
            }

            if (! $row->is_encrypted) {
                return $row->value;
            }

            try {
                return decrypt($row->value);
            } catch (\Throwable $e) {
                // Umumnya karena APP_KEY dirotasi. Jangan menebak nilai lama.
                Log::warning("Setting [{$key}] tidak bisa didekripsi — APP_KEY berubah?");
                return null;
            }
        }) ?? $default;
    }

    public static function put(string $key, ?string $value, bool $encrypt = false): void
    {
        static::updateOrCreate(
            ['key' => $key],
            [
                'value'        => $value === null || $value === '' ? null : ($encrypt ? encrypt($value) : $value),
                'is_encrypted' => $encrypt,
            ],
        );

        Cache::forget(self::CACHE_PREFIX . $key);
    }

    public static function forget(string $key): void
    {
        static::where('key', $key)->delete();
        Cache::forget(self::CACHE_PREFIX . $key);
    }
}
