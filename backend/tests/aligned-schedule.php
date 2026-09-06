<?php
/** Cek mandiri: php tests/aligned-schedule.php (butuh vendor/ terpasang). */
require __DIR__ . '/../vendor/autoload.php';
use Carbon\Carbon;

// Trait memanggil config('app.timezone'); di luar Laravel, cukup stub-nya.
if (!function_exists('config')) { function config($k) { return 'Asia/Jakarta'; } }

eval(str_replace(['<?php', 'namespace App\Traits;'], '',
     file_get_contents(__DIR__ . '/../app/Traits/HasAlignedSchedule.php')));

class S { use HasAlignedSchedule; public function n($i) { return $this->getNextAlignedSlot($i); } }
$s = new S;

$kasus = [
    ['2026-09-07 00:15:48', 6,  '2026-09-07 06:00'],  // bug asli: node baru 00:15, interval 6
    ['2026-09-07 00:15:48', 24, '2026-09-08 00:00'],  // interval harian → besok
    ['2026-09-07 23:50:00', 6,  '2026-09-08 00:00'],  // lewat slot terakhir → besok
    ['2026-09-07 06:00:00', 6,  '2026-09-07 12:00'],  // tepat di slot → slot berikutnya
    ['2026-09-07 13:10:00', 1,  '2026-09-07 14:00'],
];
foreach ($kasus as [$now, $iv, $harap]) {
    Carbon::setTestNow(Carbon::parse($now, 'Asia/Jakarta'));
    $dapat = $s->n($iv)->format('Y-m-d H:i');
    assert($dapat === $harap, "now=$now iv=$iv → $dapat, harusnya $harap");
    echo "ok  now=$now  interval={$iv}j  → $dapat\n";
}
echo "SEMUA LULUS\n";
