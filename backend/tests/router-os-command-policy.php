<?php
/**
 * Cek mandiri, tanpa framework: php tests/router-os-command-policy.php
 * Keluar dengan kode 1 kalau ada yang meleset.
 */
require __DIR__ . '/../app/Support/RouterOsCommandPolicy.php';

use App\Support\RouterOsCommandPolicy as P;

$harusDitolak = [
    '/system reset-configuration no-defaults=yes skip-backup=yes',
    '/ip firewall filter remove [find]',
    '/interface disable ether1',
    '/user remove admin',
    '/system routerboard upgrade',
    '/interface set ether1 mtu=1500',
    '/SYSTEM SHUTDOWN',
];
$harusLolos = [
    '/export',
    '/export show-sensitive',
    '/system resource print',
    '/interface print',
    '/ip address print',
    '/log print',
    '/ping 8.8.8.8 count=4',
    '/ip firewall filter print where disabled=yes',
    '/queue simple print stats',
];

$gagal = [];
foreach ($harusDitolak as $c) {
    if (!P::isDestructive($c)) $gagal[] = "LOLOS padahal harus ditolak: {$c}";
}
foreach ($harusLolos as $c) {
    if (P::isDestructive($c)) $gagal[] = "DITOLAK padahal harus lolos: {$c}";
}

if ($gagal) {
    fwrite(STDERR, implode("\n", $gagal) . "\n");
    exit(1);
}
printf("OK — %d ditolak, %d lolos, sesuai harapan\n", count($harusDitolak), count($harusLolos));
