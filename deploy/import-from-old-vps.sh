#!/usr/bin/env bash
#
# import-from-old-vps.sh — tarik daftar node dari instalasi LAMA ke instalasi ini.
#
# Dijalankan di VPS BARU, dari dalam repo:
#
#   sudo bash deploy/import-from-old-vps.sh root@IP_VPS_LAMA [/path/backend/lama]
#
# Kenapa bukan menu Ekspor "lengkap": password di sana terenkripsi dengan APP_KEY
# VPS lama, jadi tidak bisa dibuka di sini. Skrip ini mendekripsi di VPS lama,
# mengenkripsi ulang dengan APP_KEY VPS ini, lalu memakai impor yang sama dengan
# UI (validasi, semua-atau-tidak). Password polos hanya lewat pipa SSH dan memori,
# tidak pernah ditulis ke disk. Node yang namanya sudah ada di sini dilewati.
#
set -Eeuo pipefail

OLD=${1:?pakai: sudo bash deploy/import-from-old-vps.sh root@IP_VPS_LAMA [/path/backend/lama]}
OLD_DIR=${2:-/var/www/internal-backup-perwira/backend}
cd "$(dirname "$0")/../backend"

echo "==> Membaca node dari $OLD:$OLD_DIR"
# Instalasi lama bisa jadi masih Laravel 10 — kode ini sengaja hanya memakai
# DB::table + decrypt(), yang ada di kedua versi.
if ! JSON=$(ssh "$OLD" "cd $(printf %q "$OLD_DIR") && php" <<'PHP'
<?php
require 'vendor/autoload.php';
$app = require 'bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

$dec = function ($v, $label) {
    if (! $v) return null;
    try { return decrypt($v); } catch (Throwable $e) {
        fwrite(STDERR, "    ! $label: gagal didekripsi, dikosongkan — isi ulang lewat UI\n");
        return null;
    }
};

$rows = Illuminate\Support\Facades\DB::table('nodes')->orderBy('name')->get()->map(fn ($n) => [
    'name' => $n->name, 'type' => $n->type, 'host' => $n->host, 'port' => (int) $n->port,
    'ssh_user' => $n->ssh_user, 'ssh_key_path' => $n->ssh_key_path,
    'db_name' => $n->db_name, 'db_user' => $n->db_user,
    'schedule_interval_hours' => $n->schedule_interval_hours === null ? null : (int) $n->schedule_interval_hours,
    'is_active' => (bool) $n->is_active,
    'ssh_password' => $dec($n->ssh_password, "$n->name ssh_password"),
    'db_password' => $dec($n->db_password, "$n->name db_password"),
]);
echo json_encode($rows, JSON_THROW_ON_ERROR);
PHP
); then
  echo "GAGAL membaca VPS lama. Kalau disk penuh membuat MySQL mati: kosongkan sedikit ruang" >&2
  echo "(mis. journalctl --vacuum-size=50M, hapus 1-2 backup tertua), lalu systemctl start mysql." >&2
  exit 1
fi

# Dijalankan sebagai www-data supaya log yang mungkin tertulis tidak jadi milik root.
IMPORT_PHP=$(cat <<'PHP'
require 'vendor/autoload.php';
$app = require 'bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

$rows = json_decode(stream_get_contents(STDIN), true, 512, JSON_THROW_ON_ERROR);
if (! $rows) { echo "    VPS lama tidak punya node.\n"; exit(1); }

foreach ($rows as &$r) {
    foreach (['ssh_password', 'db_password'] as $col) {
        $r[$col . '_encrypted'] = $r[$col] ? encrypt($r[$col]) : null;
        unset($r[$col]);
    }
}
unset($r);

$request = Illuminate\Http\Request::create('/', 'POST', [
    'mode' => 'skip', 'dry_run' => getenv('DRY') === '1', 'nodes' => $rows,
]);
$res = app(App\Http\Controllers\Admin\NodeConfigController::class)->import($request);
$data = $res->getData(true);

echo "    {$data['message']}\n";
$s = $data['summary'];
echo "    baru: {$s['create']}, dilewati (nama sudah ada): {$s['skip']}\n";
foreach ($data['detail']['create'] ?? [] as $n) echo "      + $n\n";
foreach ($data['detail']['skip'] ?? [] as $n) echo "      = $n\n";
foreach ($data['errors'] ?? [] as $e) echo "      ✗ " . ($e['name'] ?? "#{$e['index']}") . ': ' . implode('; ', $e['errors']) . "\n";

// Key lama tinggal di VPS lama; path yang sama di sini menunjuk key BARU (atau tidak ada).
if (getenv('DRY') === '1') foreach ($rows as $r) {
    if ($r['ssh_key_path']) {
        $ada = is_file($r['ssh_key_path']) ? 'ada, tapi pastikan public key-nya terpasang di target' : 'TIDAK ADA di VPS ini';
        echo "      ! {$r['name']}: ssh_key_path {$r['ssh_key_path']} — $ada\n";
    }
}
exit($res->status() === 200 ? 0 : 1);
PHP
)

# $1 = 1 untuk pratinjau. JSON masuk lewat pipa (bukan here-string, yang bisa jadi berkas temp).
import() { printf '%s' "$JSON" | DRY=$1 runuser -u www-data -- php -r "$IMPORT_PHP"; }

echo "==> Pratinjau"
import 1 || exit 1

read -r -p "    Terapkan? [y/T] " ans </dev/tty
[[ ${ans,,} == y ]] || { echo "    Dibatalkan."; exit 0; }

echo "==> Impor"
import 0
