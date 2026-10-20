<?php
/** Cek mandiri: php tests/router-doctor.php */
require __DIR__ . '/../app/Support/RouterDoctor.php';

use App\Support\RouterDoctor as D;

$terbaru = ['a7.long-term' => '7.23.8', 'a7.stable' => '7.24.5', '6.long-term' => '6.49.23'];

// Bentuk keluaran meniru router asli (ROS 7.23 dan 6.49), alamat & nama disamarkan.
$chrIpPublik = <<<'TXT'
##kv
version=7.23.5 (long-term)
board=CHR VMware, Inc. VMware Virtual Platform
cpu=2
mem-free=3676372992
mem-total=4294967296
hdd-free=2073792512
hdd-total=2095116288
license=p1
dns-remote=false
bw-enabled=true
bw-auth=true
socks=false
proxy=false
snmp=true
mac-telnet=all
mac-winbox=all
neighbor=static
ntp=false
radius-ppp=false
interim=00:00:00
15
queues=15
0
fasttrack=0
pptp=false
l2tp=true
l2tp-ipsec=yes
sstp=true
sstp-port=443
1
wg=1
default-route=1
##service
 0  X  name=ftp port=21 proto=tcp address= vrf=main max-sessions=20
 1     name=ssh port=22 proto=tcp address=203.0.113.7/32,198.51.100.0/28 vrf=main max-sessions=20
 2 D c name=ssh port=22 proto=tcp local=192.0.2.8 remote=198.51.100.9:36294
 3  X  name=telnet port=23 proto=tcp address= vrf=main max-sessions=20
 8     name=reverse-proxy port=443 proto=tcp address= certificate=none tls-version=any vrf=main max-sessions=20
37 D   name=ipsec port=500 proto=udp
40     name=winbox port=2805 proto=tcp address= vrf=main max-sessions=20
45 D   name=wireguard-wgserver port=8443 proto=udp
##addr
 0 I  address=192.0.2.200/29 network=192.0.2.192 interface=*2 actual-interface=*2 vrf=main
 1    address=192.0.2.8/28 network=192.0.2.0 interface=VLAN618-UPLINK actual-interface=VLAN618-UPLINK vrf=main
 3    address=10.18.58.58/32 network=198.51.100.101 interface=wgserver actual-interface=wgserver vrf=main
##filter
##pppoe
##profile
0 * name=default use-ipv6=yes change-tcp-mss=yes
1   name=PUBLIK local-address=198.51.100.64 change-tcp-mss=default
##snmpc
0 *X name=public addresses=::/0 security=none read-access=yes write-access=no
1    name=nms addresses=198.51.100.0/28 security=none read-access=yes write-access=no
TXT;

// ROS 6: address="" berkutip, flag "XI", PPPoE + RADIUS tanpa server, lisensi free, DNS terbuka.
$chrPppoe = <<<'TXT'
##kv
version=6.49.21 (long-term)
board=CHR
cpu=91
mem-free=300000000
mem-total=4127195136
hdd-free=2100260864
hdd-total=2137124864
license=free
dns-remote=true
bw-enabled=true
bw-auth=false
socks=true
proxy=false
snmp=false
mac-telnet=all
mac-winbox=all
neighbor=all
ntp=true
radius-ppp=true
interim=00:00:00
queues=508
fasttrack=1
radius=0
pptp=true
l2tp=false
l2tp-ipsec=no
sstp=false
wg=?
default-route=1
##service
 0 XI name="telnet" port=23 address=""
 1    name="ftp" port=21 address=""
 3    name="ssh" port=22 address=10.0.0.0/8
 6    name="winbox" port=8291 address=""
##addr
 0   address=192.0.2.50/30 network=192.0.2.48 interface=ether1
 1   address=100.64.10.1/22 network=100.64.8.0 interface=ether2
##filter
 0   chain=input action=accept protocol=icmp
##pppoe
 0   service-name="" interface=ether2 one-session-per-host=no default-profile=default
##profile
 0 * name="default" change-tcp-mss=yes
 1   name="paket-10M" change-tcp-mss=no rate-limit=10M/10M
##snmpc
TXT;

// Router yang sudah sesuai standar.
$sehat = <<<'TXT'
##kv
version=7.23.8 (long-term)
board=CCR2116-12G-4S+
cpu=4
mem-free=3000000000
mem-total=4000000000
hdd-free=100000000
hdd-total=128000000
license=?
dns-remote=true
bw-enabled=false
bw-auth=true
socks=false
proxy=false
snmp=false
mac-telnet=LAN
mac-winbox=LAN
neighbor=LAN
ntp=true
radius-ppp=false
queues=0
fasttrack=0
pptp=false
l2tp=false
sstp=false
wg=0
default-route=1
##service
 0  X  name=telnet port=23 proto=tcp address= vrf=main
 1     name=winbox port=8291 proto=tcp address= vrf=main
##addr
 0    address=192.0.2.1/30 network=192.0.2.0 interface=sfp1-WAN actual-interface=sfp1-WAN vrf=main
##filter
0 chain=input action=accept connection-state=established,related
1 chain=input action=drop connection-state=invalid
2 chain=input action=accept src-address-list=NOC
3 chain=input action=drop in-interface-list=WAN log=no log-prefix=
##pppoe
##profile
##snmpc
TXT;

$gagal = [];
$harap = function (string $nama, array $lap, array $status) use (&$gagal) {
    $dapat = array_column($lap['cek'], 'status', 'id');
    foreach ($status as $id => $s) {
        if (($dapat[$id] ?? 'TIDAK ADA') !== $s) {
            $gagal[] = "{$nama}: cek {$id} harap {$s}, dapat " . ($dapat[$id] ?? 'TIDAK ADA');
        }
    }
};
$perbaikan = fn (array $lap, string $id) => array_column($lap['cek'], 'perbaikan', 'id')[$id] ?? '';

// 1. CHR IP publik tanpa firewall
$a = D::periksa(D::parse($chrIpPublik), $terbaru);
if ($a['peran'] !== ['CHR', 'IP Publik', 'Server VPN']) $gagal[] = 'chrIpPublik: peran ' . implode(',', $a['peran']);
$harap('chrIpPublik', $a, [
    'firewall-input' => 'kritis', 'akses-manajemen' => 'kritis', 'layanan-polos' => 'ok', 'dns-terbuka' => 'ok',
    'bandwidth-server' => 'info', 'snmp' => 'ok', 'mac-neighbor' => 'peringatan', 'versi' => 'peringatan',
    'ntp' => 'peringatan', 'lisensi' => 'ok', 'sumber-daya' => 'ok',
]);
$fw = $perbaikan($a, 'firewall-input');
foreach (['dst-port=500,1701,4500', 'ipsec-esp', 'protocol=tcp dst-port=443', 'dst-port=8443', 'in-interface=VLAN618-UPLINK action=drop',
          'list=NOC address=203.0.113.7/32', 'Safe Mode'] as $wajib) {
    if (!str_contains($fw, $wajib)) $gagal[] = "chrIpPublik: perbaikan firewall tanpa '{$wajib}'";
}
if (str_contains($fw, 'interface=*2')) $gagal[] = 'chrIpPublik: alamat tak valid (I) ikut dipakai';
if (!str_contains($perbaikan($a, 'akses-manajemen'), '[find name=winbox] address=203.0.113.7/32,198.51.100.0/28')) {
    $gagal[] = 'chrIpPublik: batas address winbox tidak disamakan dengan SSH';
}
if ($a['ringkasan']['kritis'] !== 2 || $a['utama'] === null) $gagal[] = 'chrIpPublik: ringkasan ' . json_encode($a['ringkasan']);
if ($a['utama'] !== 'Firewall input menutup akses dari internet') $gagal[] = 'chrIpPublik: masalah utama harus firewall, dapat ' . $a['utama'];


// 2. CHR PPPoE ROS 6 serba salah
$b = D::periksa(D::parse($chrPppoe), $terbaru);
if ($b['peran'] !== ['CHR', 'IP Publik', 'Server VPN', 'PPPoE Server']) $gagal[] = 'chrPppoe: peran ' . implode(',', $b['peran']);
$harap('chrPppoe', $b, [
    'lisensi' => 'kritis', 'firewall-input' => 'kritis', 'dns-terbuka' => 'kritis', 'layanan-polos' => 'kritis',
    'akses-manajemen' => 'kritis', 'bandwidth-server' => 'kritis', 'proxy' => 'kritis', 'radius' => 'kritis',
    'mss' => 'peringatan', 'satu-sesi' => 'peringatan', 'fasttrack' => 'peringatan', 'vpn' => 'peringatan',
    'sumber-daya' => 'peringatan', 'versi' => 'peringatan', 'ntp' => 'ok', 'mac-neighbor' => 'peringatan',
]);
if (array_key_exists('snmp', array_column($b['cek'], 'status', 'id'))) $gagal[] = 'chrPppoe: SNMP mati tapi tetap dicek';
if (!str_contains($perbaikan($b, 'layanan-polos'), '[find name=ftp]') || str_contains($perbaikan($b, 'layanan-polos'), 'telnet')) {
    $gagal[] = 'chrPppoe: telnet yang mati (XI) ikut disuruh dimatikan, atau ftp terlewat';
}
if (!str_contains($perbaikan($b, 'mss'), 'paket-10M')) $gagal[] = 'chrPppoe: profil tanpa MSS tidak disebut';
if (!str_contains($perbaikan($b, 'akses-manajemen'), 'address=10.0.0.0/8')) {
    $gagal[] = 'chrPppoe: batas address dari SSH ROS 6 tidak terbaca';
}
if ($b['cek'][0]['status'] !== 'kritis') $gagal[] = 'chrPppoe: urutan — yang kritis harus di atas';
if ($b['utama'] !== 'Lisensi CHR berbayar (P1 ke atas)') $gagal[] = 'chrPppoe: masalah utama harus lisensi free, dapat ' . $b['utama'];

// 3. Router sehat
$c = D::periksa(D::parse($sehat), $terbaru);
if ($c['ringkasan']['kritis'] || $c['ringkasan']['peringatan'] || $c['utama'] !== null) {
    $gagal[] = 'sehat: harusnya bersih, dapat ' . json_encode(array_filter(array_column($c['cek'], 'status', 'id'), fn ($s) => $s !== 'ok'));
}
if (in_array('CHR', $c['peran'], true)) $gagal[] = 'sehat: bukan CHR';

// 4. Drop menyeluruh di chain buatan yang dituju jump dari input → tidak boleh dinilai kritis.
$lompat = str_replace(
    "3 chain=input action=drop in-interface-list=WAN log=no log-prefix=",
    "3 chain=input action=jump jump-target=wan-masuk\n4 chain=forward action=drop in-interface=sfp1-WAN\n5 chain=wan-masuk action=drop in-interface=sfp1-WAN",
    $sehat);
$e = D::periksa(D::parse($lompat), $terbaru);
$harap('lompat', $e, ['firewall-input' => 'ok']);
// Drop yang hanya ada di chain forward bukan perlindungan input.
$e2 = D::periksa(D::parse(str_replace("5 chain=wan-masuk action=drop in-interface=sfp1-WAN", "", $lompat)), $terbaru);
$harap('hanya-forward', $e2, ['firewall-input' => 'kritis']);

// 5. Script: tiap nilai dibungkus on-error supaya satu menu yang tak ada tidak menghentikan sisanya.
$s = D::script();
if (substr_count($s, 'on-error=') < 30 || !str_contains($s, '##service')) $gagal[] = 'script: pembungkus on-error kurang';

// 6. Kritis baru: hanya yang berubah menjadi kritis, dan hanya kalau ada laporan lama yang sah.
$ids = fn (array $l) => array_column($l, 'id');
if (D::kritisBaru(null, $b) !== []) $gagal[] = 'kritisBaru: tanpa laporan lama harus kosong';
if (D::kritisBaru(['galat' => 'SSH timeout'], $b) !== []) $gagal[] = 'kritisBaru: laporan lama galat harus kosong';
if (D::kritisBaru($b, $b) !== []) $gagal[] = 'kritisBaru: laporan sama harus kosong';
$kritisB = $ids(array_filter($b['cek'], fn ($x) => $x['status'] === 'kritis'));
if ($ids(D::kritisBaru($c, $b)) !== $kritisB) $gagal[] = 'kritisBaru: sehat → chrPppoe harus semua kritis chrPppoe, dapat ' . json_encode($ids(D::kritisBaru($c, $b)));
if (D::kritisBaru($b, $c) !== []) $gagal[] = 'kritisBaru: membaik tidak boleh dilaporkan';
if (!$kritisB) $gagal[] = 'kritisBaru: profil chrPppoe seharusnya punya temuan kritis';

if ($gagal) { fwrite(STDERR, implode("\n", $gagal) . "\n"); exit(1); }
echo "OK — 3 profil router dinilai sesuai standar\n";
