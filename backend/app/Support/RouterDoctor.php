<?php

namespace App\Support;

/**
 * Doctor MikroTik: membandingkan konfigurasi router dengan standar Perwira (keamanan, sistem,
 * lisensi CHR, PPPoE, VPN/IP publik). Peran router dideteksi otomatis dari konfigurasinya.
 *
 * Murni — tidak menyentuh router. Data diambil sekali lewat script() (perintah baca saja,
 * satu sesi SSH), diurai parse(), lalu dinilai periksa(). Tesnya: php tests/router-doctor.php
 */
final class RouterDoctor
{
    /** Nilai tunggal: kunci => ekspresi RouterOS. Gagal (menu tak ada di versi itu) → "?". */
    private const NILAI = [
        'version'       => '/system resource get version',
        'board'         => '/system resource get board-name',
        'cpu'           => '/system resource get cpu-load',
        'mem-free'      => '/system resource get free-memory',
        'mem-total'     => '/system resource get total-memory',
        'hdd-free'      => '/system resource get free-hdd-space',
        'hdd-total'     => '/system resource get total-hdd-space',
        'license'       => '/system license get level',
        'dns-remote'    => '/ip dns get allow-remote-requests',
        'bw-enabled'    => '/tool bandwidth-server get enabled',
        'bw-auth'       => '/tool bandwidth-server get authenticate',
        'socks'         => '/ip socks get enabled',
        'proxy'         => '/ip proxy get enabled',
        'snmp'          => '/snmp get enabled',
        'mac-telnet'    => '/tool mac-server get allowed-interface-list',
        'mac-winbox'    => '/tool mac-server mac-winbox get allowed-interface-list',
        'neighbor'      => '/ip neighbor discovery-settings get discover-interface-list',
        'ntp'           => '/system ntp client get enabled',
        'radius-ppp'    => '/ppp aaa get use-radius',
        'interim'       => '/ppp aaa get interim-update',
        'queues'        => '/queue simple print count-only',
        'fasttrack'     => '/ip firewall filter print count-only where action=fasttrack-connection disabled=no',
        'radius'        => '/radius print count-only',
        'pptp'          => '/interface pptp-server server get enabled',
        'l2tp'          => '/interface l2tp-server server get enabled',
        'l2tp-ipsec'    => '/interface l2tp-server server get use-ipsec',
        'sstp'          => '/interface sstp-server server get enabled',
        'sstp-port'     => '/interface sstp-server server get port',
        'wg'            => '/interface wireguard print count-only',
        'default-route' => '/ip route print count-only where dst-address=0.0.0.0/0 active',
    ];

    /** Daftar: bagian => perintah "print terse". */
    private const DAFTAR = [
        'service' => '/ip service print terse',
        'addr'    => '/ip address print terse',
        // Semua chain, bukan hanya input: drop bisa berada di chain buatan yang dituju "jump" dari input.
        'filter'  => '/ip firewall filter print terse',
        'pppoe'   => '/interface pppoe-server server print terse',
        'profile' => '/ppp profile print terse',
        'snmpc'   => '/snmp community print terse',
    ];

    private const URUTAN = ['kritis' => 0, 'peringatan' => 1, 'info' => 2, 'ok' => 3];

    public static function script(): string
    {
        $p = [':put "##kv"'];
        foreach (self::NILAI as $k => $c) {
            $p[] = ":do {:put (\"{$k}=\" . [{$c}])} on-error={:put \"{$k}=?\"}";
        }
        foreach (self::DAFTAR as $k => $c) {
            $p[] = ":put \"##{$k}\"";
            $p[] = ":do {{$c}} on-error={:put \"!err\"}";
        }

        return implode('; ', $p);
    }

    /** @return array{kv: array<string, string>, daftar: array<string, list<array<string, string>>>} */
    public static function parse(string $output): array
    {
        $kv = [];
        $daftar = [];
        $bagian = null;
        foreach (preg_split('/\R/', $output) as $baris) {
            if (str_starts_with($baris, '##')) {
                $bagian = substr($baris, 2);
                continue;
            }
            if ($bagian === 'kv') {
                // "print count-only" di dalam [] ikut mencetak angkanya di baris sendiri — dilewati.
                if (preg_match('/^([\w-]+)=(.*)$/', trim($baris), $m)) {
                    $kv[$m[1]] = trim($m[2]);
                }
            } elseif ($bagian !== null && preg_match('/^\s*\d+\s+(.*)$/', $baris, $m)) {
                $daftar[$bagian][] = self::baris($m[1]);
            }
        }

        return ['kv' => $kv, 'daftar' => $daftar];
    }

    /** ' X  name=ftp port=21 address=""' → ['_flags' => 'X', 'name' => 'ftp', 'port' => '21', 'address' => ''] */
    private static function baris(string $s): array
    {
        $awal = preg_match('/[\w.-]+=/', $s, $m, PREG_OFFSET_CAPTURE) ? $m[0][1] : strlen($s);
        $item = ['_flags' => preg_replace('/[^A-Za-z*]/', '', substr($s, 0, $awal))];
        // ROS 6 mengutip nilai kosong (address=""), ROS 7 tidak (address=).
        preg_match_all('/([\w.-]+)=("(?:[^"\\\\]|\\\\.)*"|\S*)/', substr($s, $awal), $mm, PREG_SET_ORDER);
        foreach ($mm as [, $k, $v]) {
            $item[$k] = trim($v, '"');
        }

        return $item;
    }

    /**
     * @param array<string, string> $terbaru versi terbaru per kanal, mis. ['a7.long-term' => '7.23.8']
     */
    public static function periksa(array $data, array $terbaru = []): array
    {
        $kv = $data['kv'];
        $d = $data['daftar'];
        $nyala = fn (string $k) => ($kv[$k] ?? '') === 'true';

        // Entri dinamis (D), mati (X), atau tak valid (I) tidak dihitung sebagai konfigurasi aktif.
        $aktif = fn (string $b) => array_values(array_filter($d[$b] ?? [], fn ($r) => !preg_match('/[XDI]/', $r['_flags'])));
        $layanan = array_column($aktif('service'), null, 'name');
        $input = self::aturanInput($aktif('filter'));
        $publik = array_values(array_filter($aktif('addr'), fn ($a) => self::ipPublik($a['address'] ?? '')));

        $k = [
            'chr'    => str_starts_with($kv['board'] ?? '', 'CHR'),
            'publik' => $publik !== [],
            'pppoe'  => $aktif('pppoe') !== [],
            'vpn'    => $nyala('l2tp') || $nyala('sstp') || $nyala('pptp') || (int) ($kv['wg'] ?? 0) > 0,
            'drop'   => self::dropMenyeluruh($input),
            'mayor'  => (int) ($kv['version'] ?? 0),
        ];
        // Router ber-IP publik tanpa drop menyeluruh = layanan yang terbuka benar-benar terjangkau dari internet.
        $terpapar = $k['publik'] && !$k['drop'];

        // Urutan = prioritas di antara status yang sama: akar masalah (lisensi, firewall) lebih dulu.
        $cek = array_values(array_filter([
            $k['chr'] ? self::lisensi($kv) : null,
            self::firewallInput($k, $kv, $d, $publik, $layanan),
            self::dnsTerbuka($kv, $k, $input, $publik),
            self::aksesManajemen($layanan, $k),
            self::layananPolos($layanan, $terpapar),
            self::bandwidthServer($kv, $k, $terpapar),
            self::proxyTerbuka($kv, $terpapar),
            $nyala('snmp') ? self::snmp($aktif('snmpc')) : null,
            self::macDanNeighbor($kv, $k),
            self::vpn($kv),
            self::versi($kv, $k, $terbaru),
            self::ntp($kv, $k),
            self::sumberDaya($kv),
            self::ruteDefault($kv),
            $k['pppoe'] ? self::mss($aktif('profile')) : null,
            $k['pppoe'] ? self::satuSesi($aktif('pppoe')) : null,
            $nyala('radius-ppp') ? self::radius($kv) : null,
            (int) ($kv['fasttrack'] ?? 0) > 0 ? self::fasttrack($kv) : null,
        ]));
        usort($cek, fn ($a, $b) => self::URUTAN[$a['status']] <=> self::URUTAN[$b['status']]);

        $ringkasan = array_fill_keys(array_keys(self::URUTAN), 0);
        foreach ($cek as $c) {
            $ringkasan[$c['status']]++;
        }
        $utama = $cek[0] ?? null;

        return [
            'peran'     => array_keys(array_filter([
                'CHR' => $k['chr'], 'IP Publik' => $k['publik'], 'Server VPN' => $k['vpn'], 'PPPoE Server' => $k['pppoe'],
            ])),
            'versi'     => $kv['version'] ?? null,
            'ringkasan' => $ringkasan,
            'utama'     => $utama && in_array($utama['status'], ['kritis', 'peringatan'], true) ? $utama['judul'] : null,
            'cek'       => $cek,
        ];
    }

    // ─── Keamanan ────────────────────────────────────────────────────────────

    private static function layananPolos(array $layanan, bool $terpapar): array
    {
        $judul = 'Telnet, FTP, dan www (HTTP) dimatikan';
        $nyala = array_values(array_intersect(['telnet', 'ftp', 'www'], array_keys($layanan)));
        if (!$nyala) {
            return self::item('layanan-polos', 'Keamanan', 'ok', $judul, 'Ketiganya mati.');
        }
        $tanpaBatas = array_filter($nyala, fn ($n) => ($layanan[$n]['address'] ?? '') === '');

        return self::item('layanan-polos', 'Keamanan', $terpapar && $tanpaBatas ? 'kritis' : 'peringatan', $judul,
            'Masih aktif: ' . implode(', ', $nyala) . '. Protokol ini mengirim password tanpa enkripsi'
            . ($terpapar && $tanpaBatas ? ' dan bisa dijangkau dari internet.' : '.'),
            implode("\n", array_map(fn ($n) => "/ip service set [find name={$n}] disabled=yes", $nyala)));
    }

    private static function aksesManajemen(array $layanan, array $k): array
    {
        $judul = 'Winbox, SSH, dan API dibatasi alamat NOC';
        $terbuka = array_values(array_filter(['winbox', 'ssh', 'api', 'api-ssl', 'www-ssl'],
            fn ($n) => isset($layanan[$n]) && ($layanan[$n]['address'] ?? '') === ''));
        if (!$terbuka || !$k['publik']) {
            return self::item('akses-manajemen', 'Keamanan', 'ok', $judul,
                $terbuka ? 'Tidak ada IP publik, jadi layanan tanpa batas alamat hanya terjangkau dari jaringan dalam.' : 'Semua layanan manajemen yang aktif sudah punya batas address.');
        }
        $noc = self::alamatNoc($layanan);

        return self::item('akses-manajemen', 'Keamanan', $k['drop'] ? 'info' : 'kritis', $judul,
            'Tanpa batas address: ' . implode(', ', $terbuka) . '. '
            . ($k['drop'] ? 'Saat ini dilindungi aturan drop di firewall; batas address jadi lapis kedua.' : 'Router ber-IP publik tanpa firewall input — siapa pun di internet bisa mencoba login.'),
            implode("\n", array_map(fn ($n) => "/ip service set [find name={$n}] address={$noc}", $terbuka)));
    }

    private static function firewallInput(array $k, array $kv, array $d, array $publik, array $layanan): ?array
    {
        if (!$k['publik']) {
            return null;
        }
        $judul = 'Firewall input menutup akses dari internet';
        if ($k['drop']) {
            return self::item('firewall-input', 'Keamanan', 'ok', $judul, 'Ada aturan drop menyeluruh di chain input.');
        }

        $noc = self::alamatNoc($layanan);
        $baris = [
            '# Jalankan dalam Safe Mode (Ctrl+X) — kalau koneksi Anda terputus, perubahan dibatalkan otomatis.',
            '# Layanan lain yang memang dipakai dari internet (BGP tcp 179, API aplikasi, dll.) WAJIB ditambah accept sebelum baris drop.',
        ];
        foreach (explode(',', $noc) as $a) {
            $baris[] = "/ip firewall address-list add list=NOC address={$a}";
        }
        $baris[] = '/ip firewall filter';
        $baris[] = 'add chain=input connection-state=established,related action=accept comment="doctor: koneksi balik"';
        $baris[] = 'add chain=input connection-state=invalid action=drop comment="doctor: invalid"';
        $baris[] = 'add chain=input src-address-list=NOC action=accept comment="doctor: NOC"';
        $baris[] = 'add chain=input protocol=icmp action=accept comment="doctor: ping"';
        if (($kv['l2tp'] ?? '') === 'true') {
            $baris[] = 'add chain=input protocol=udp dst-port=500,1701,4500 action=accept comment="doctor: L2TP/IPsec"';
            $baris[] = 'add chain=input protocol=ipsec-esp action=accept comment="doctor: IPsec"';
        }
        if (($kv['sstp'] ?? '') === 'true') {
            $port = ctype_digit($kv['sstp-port'] ?? '') ? $kv['sstp-port'] : '443';
            $baris[] = "add chain=input protocol=tcp dst-port={$port} action=accept comment=\"doctor: SSTP\"";
        }
        // Port WireGuard terlihat dari entri dinamis /ip service ("wireguard-<nama>").
        foreach ($d['service'] ?? [] as $s) {
            if (str_starts_with($s['name'] ?? '', 'wireguard') && ctype_digit($s['port'] ?? '')) {
                $baris[] = "add chain=input protocol=udp dst-port={$s['port']} action=accept comment=\"doctor: WireGuard\"";
            }
        }
        foreach (array_unique(array_column($publik, 'interface')) as $wan) {
            $baris[] = "add chain=input in-interface={$wan} action=drop comment=\"doctor: drop sisa dari internet\"";
        }

        return self::item('firewall-input', 'Keamanan', 'kritis', $judul,
            'Router punya IP publik (' . implode(', ', array_column($publik, 'address')) . ') tetapi chain input tidak punya aturan drop menyeluruh — '
            . 'semua layanan router terbuka ke internet. Perbaikan di bawah disusun dari layanan VPN yang aktif di router ini.',
            implode("\n", $baris));
    }

    private static function dnsTerbuka(array $kv, array $k, array $input, array $publik): array
    {
        $judul = 'DNS tidak menjadi open resolver';
        if (($kv['dns-remote'] ?? '') !== 'true' || !$k['publik']) {
            return self::item('dns-terbuka', 'Keamanan', 'ok', $judul,
                ($kv['dns-remote'] ?? '') === 'true' ? 'Melayani DNS, tetapi router tidak punya IP publik.' : 'Router tidak melayani permintaan DNS dari luar.');
        }
        $port53 = array_filter($input, fn ($r) => in_array($r['action'] ?? '', ['drop', 'reject'], true)
            && preg_match('/(^|,)53(,|$)/', $r['dst-port'] ?? ''));
        if ($k['drop'] || $port53) {
            return self::item('dns-terbuka', 'Keamanan', 'ok', $judul,
                $k['drop'] ? 'Melayani DNS, port 53 dari internet tertutup oleh drop menyeluruh.' : 'Melayani DNS, port 53 dari internet ditutup aturan drop khusus — pastikan semua interface WAN tercakup.');
        }
        $wan = $publik[0]['interface'] ?? '<interface-WAN>';

        return self::item('dns-terbuka', 'Keamanan', 'kritis', $judul,
            'allow-remote-requests=yes di router ber-IP publik tanpa penutup port 53: router bisa dipakai untuk serangan DNS amplification dan IP-nya masuk daftar hitam.',
            "/ip firewall filter add chain=input in-interface={$wan} protocol=udp dst-port=53 action=drop comment=\"doctor: tutup DNS\"\n"
            . "/ip firewall filter add chain=input in-interface={$wan} protocol=tcp dst-port=53 action=drop comment=\"doctor: tutup DNS\"\n"
            . '# atau, kalau router tidak melayani DNS pelanggan: /ip dns set allow-remote-requests=no');
    }

    private static function bandwidthServer(array $kv, array $k, bool $terpapar): array
    {
        $judul = 'Bandwidth test server mati atau berautentikasi';
        if (($kv['bw-enabled'] ?? '') !== 'true') {
            return self::item('bandwidth-server', 'Keamanan', 'ok', $judul, 'Mati.');
        }
        $perbaikan = '/tool bandwidth-server set enabled=no';
        if (($kv['bw-auth'] ?? '') !== 'true') {
            return self::item('bandwidth-server', 'Keamanan', $terpapar ? 'kritis' : 'peringatan', $judul,
                'Aktif tanpa autentikasi: siapa pun yang menjangkau router bisa menyedot bandwidth lewat btest.', $perbaikan);
        }

        return self::item('bandwidth-server', 'Keamanan', $k['publik'] ? 'info' : 'ok', $judul,
            'Aktif dengan autentikasi.' . ($k['publik'] ? ' Matikan kalau tidak rutin dipakai.' : ''), $k['publik'] ? $perbaikan : null);
    }

    private static function proxyTerbuka(array $kv, bool $terpapar): array
    {
        $judul = 'SOCKS dan web proxy mati';
        $nyala = array_keys(array_filter(['socks' => $kv['socks'] ?? '', 'proxy' => $kv['proxy'] ?? ''], fn ($v) => $v === 'true'));
        if (!$nyala) {
            return self::item('proxy', 'Keamanan', 'ok', $judul, 'Keduanya mati.');
        }

        return self::item('proxy', 'Keamanan', $terpapar ? 'kritis' : 'peringatan', $judul,
            'Aktif: ' . implode(', ', $nyala) . '. Proxy terbuka dipakai orang lain untuk spam/serangan atas nama IP Perwira.',
            implode("\n", array_map(fn ($n) => "/ip {$n} set enabled=no", $nyala)));
    }

    private static function snmp(array $komunitas): array
    {
        $judul = 'SNMP community dibatasi alamat';
        $longgar = array_filter($komunitas, fn ($c) => ($c['name'] ?? '') === 'public'
            || in_array($c['addresses'] ?? '', ['', '0.0.0.0/0', '::/0'], true));
        if (!$longgar) {
            return self::item('snmp', 'Keamanan', 'ok', $judul, $komunitas ? 'Semua community aktif punya batas alamat.' : 'Tidak ada community aktif.');
        }
        $nama = array_column($longgar, 'name');

        return self::item('snmp', 'Keamanan', 'peringatan', $judul,
            'Community terlalu longgar: ' . implode(', ', $nama) . ' (nama "public" atau address terbuka). Isinya membocorkan topologi dan trafik.',
            implode("\n", array_map(fn ($n) => "/snmp community set [find name=\"{$n}\"] addresses=<IP-NMS>", $nama)));
    }

    private static function macDanNeighbor(array $kv, array $k): array
    {
        $judul = 'MAC server & neighbor discovery tidak di semua interface';
        $setelan = [
            'mac-telnet' => '/tool mac-server set allowed-interface-list=none',
            'mac-winbox' => '/tool mac-server mac-winbox set allowed-interface-list=none',
            'neighbor'   => '/ip neighbor discovery-settings set discover-interface-list=none',
        ];
        $semua = array_keys(array_filter($setelan, fn ($_, $kunci) => ($kv[$kunci] ?? '') === 'all', ARRAY_FILTER_USE_BOTH));
        if (!$semua || !$k['publik']) {
            return self::item('mac-neighbor', 'Keamanan', 'ok', $judul,
                $semua ? 'Aktif di semua interface, tetapi router tidak punya IP publik.' : 'Sudah dibatasi.');
        }

        return self::item('mac-neighbor', 'Keamanan', 'peringatan', $judul,
            'Aktif di semua interface: ' . implode(', ', $semua) . '. Di segmen bersama (VLAN datacenter/upstream) perangkat lain bisa melihat dan me-Winbox router lewat MAC. '
            . 'Ganti "none" dengan interface list LAN kalau masih butuh akses MAC dari dalam.',
            implode("\n", array_map(fn ($kunci) => $setelan[$kunci], $semua)));
    }

    private static function vpn(array $kv): ?array
    {
        if (($kv['pptp'] ?? '') === 'true') {
            return self::item('vpn', 'VPN', 'peringatan', 'Server VPN memakai protokol yang aman',
                'PPTP server aktif. Enkripsinya (MPPE/MS-CHAPv2) sudah bisa dibobol — pindahkan klien ke L2TP/IPsec, SSTP, atau WireGuard.',
                '/interface pptp-server server set enabled=no');
        }
        if (($kv['l2tp'] ?? '') === 'true' && ($kv['l2tp-ipsec'] ?? '') === 'no') {
            return self::item('vpn', 'VPN', 'info', 'Server VPN memakai protokol yang aman',
                'L2TP tanpa IPsec: lalu lintas tunnel tidak terenkripsi. Wajar untuk layanan IP publik yang mengutamakan kompatibilitas, tapi jangan untuk akses manajemen.');
        }

        return null;
    }

    // ─── Sistem ──────────────────────────────────────────────────────────────

    private static function versi(array $kv, array $k, array $terbaru): ?array
    {
        if (!preg_match('/^(\S+)\s*\(([\w-]+)\)/', $kv['version'] ?? '', $m)) {
            return null;
        }
        [, $v, $kanal] = $m;
        $baru = $terbaru[($k['mayor'] >= 7 ? 'a7.' : '6.') . $kanal] ?? null;
        $judul = 'RouterOS versi terbaru di kanalnya';
        if (!$baru) {
            return self::item('versi', 'Sistem', 'info', $judul, "Terpasang {$v} ({$kanal}); versi terbaru tidak bisa dicek dari server MikroTik.");
        }
        $catatanV6 = $k['mayor'] < 7 ? ' RouterOS 6 tinggal menerima perbaikan; rencanakan migrasi ke v7.' : '';
        if (version_compare($v, $baru, '>=')) {
            return self::item('versi', 'Sistem', $catatanV6 ? 'info' : 'ok', $judul, "Terpasang {$v}, sudah terbaru di kanal {$kanal}.{$catatanV6}");
        }

        return self::item('versi', 'Sistem', 'peringatan', $judul,
            "Terpasang {$v}, terbaru di kanal {$kanal}: {$baru}. Pembaruan biasanya memuat perbaikan keamanan.{$catatanV6} Pasang di luar jam sibuk — router akan reboot.",
            "/system package update set channel={$kanal}\n/system package update install");
    }

    private static function ntp(array $kv, array $k): array
    {
        $judul = 'Jam router disinkronkan NTP';
        if (($kv['ntp'] ?? '') === 'true') {
            return self::item('ntp', 'Sistem', 'ok', $judul, 'NTP client aktif.');
        }

        return self::item('ntp', 'Sistem', 'peringatan', $judul,
            'NTP client mati: jam meleset membuat log, jadwal script, dan validasi sertifikat (SSTP) salah.',
            $k['mayor'] >= 7
                ? '/system ntp client set enabled=yes servers=id.pool.ntp.org,time.google.com'
                : '/system ntp client set enabled=yes server-dns-names=id.pool.ntp.org,time.google.com');
    }

    private static function sumberDaya(array $kv): ?array
    {
        if (!is_numeric($kv['cpu'] ?? null)) {
            return null;
        }
        $persen = fn (string $a, string $b) => is_numeric($kv[$a] ?? null) && (float) ($kv[$b] ?? 0) > 0
            ? (int) round($kv[$a] / $kv[$b] * 100) : null;
        $ram = $persen('mem-free', 'mem-total');
        $disk = $persen('hdd-free', 'hdd-total');
        $masalah = array_filter([
            (int) $kv['cpu'] >= 80 ? "CPU {$kv['cpu']}%" : null,
            $ram !== null && $ram < 10 ? "RAM bebas {$ram}%" : null,
            $disk !== null && $disk < 10 ? "disk bebas {$disk}%" : null,
        ]);
        $detail = "CPU {$kv['cpu']}%, RAM bebas " . ($ram ?? '?') . '%, disk bebas ' . ($disk ?? '?') . '%.';

        return self::item('sumber-daya', 'Sistem', $masalah ? 'peringatan' : 'ok', 'CPU, RAM, dan disk cukup longgar',
            $masalah ? 'Menipis: ' . implode(', ', $masalah) . ". {$detail}" : $detail);
    }

    private static function ruteDefault(array $kv): ?array
    {
        if (!ctype_digit($kv['default-route'] ?? '')) {
            return null;
        }

        return (int) $kv['default-route'] > 0
            ? self::item('rute-default', 'Sistem', 'ok', 'Ada rute default yang aktif', 'Rute 0.0.0.0/0 aktif.')
            : self::item('rute-default', 'Sistem', 'info', 'Ada rute default yang aktif',
                'Tidak ada rute 0.0.0.0/0 yang aktif — router tidak bisa ke internet (cek pembaruan, NTP, DNS). Abaikan kalau memang disengaja.');
    }

    // ─── CHR ─────────────────────────────────────────────────────────────────

    private static function lisensi(array $kv): array
    {
        $level = $kv['license'] ?? '?';
        $judul = 'Lisensi CHR berbayar (P1 ke atas)';

        return match ($level) {
            'free' => self::item('lisensi', 'CHR', 'kritis', $judul,
                'Lisensi free membatasi upload 1 Mbps per interface — pelanggan di belakang CHR ini praktis tidak bisa dipakai.',
                '/system license renew account=<akun-mikrotik> password=<password> level=p1'),
            'p1' => self::item('lisensi', 'CHR', 'ok', $judul, 'Lisensi P1 (batas 1 Gbps per interface).'),
            'p10' => self::item('lisensi', 'CHR', 'ok', $judul, 'Lisensi P10 (batas 10 Gbps per interface).'),
            'unlimited', 'p-unlimited' => self::item('lisensi', 'CHR', 'ok', $judul, 'Lisensi unlimited.'),
            default => self::item('lisensi', 'CHR', 'info', $judul, "Level lisensi tidak terbaca ({$level}); cek /system license print."),
        };
    }

    // ─── PPPoE ───────────────────────────────────────────────────────────────

    private static function mss(array $profil): array
    {
        $judul = 'Profil PPP mengubah TCP MSS';
        $tanpa = array_column(array_filter($profil, fn ($p) => ($p['change-tcp-mss'] ?? '') === 'no'), 'name');
        if (!$tanpa) {
            return self::item('mss', 'PPPoE', 'ok', $judul, 'Semua profil memakai change-tcp-mss (yes atau mewarisi default).');
        }

        return self::item('mss', 'PPPoE', 'peringatan', $judul,
            'change-tcp-mss=no di profil: ' . implode(', ', $tanpa) . '. MTU PPPoE lebih kecil dari Ethernet — tanpa MSS clamping sebagian situs (HTTPS, aplikasi) menggantung saat dibuka.',
            implode("\n", array_map(fn ($n) => "/ppp profile set [find name=\"{$n}\"] change-tcp-mss=yes", $tanpa)));
    }

    private static function satuSesi(array $server): array
    {
        $judul = 'PPPoE server: satu sesi per perangkat';
        $longgar = array_map(fn ($s) => ($s['service-name'] ?? '') ?: ($s['interface'] ?? '?'),
            array_filter($server, fn ($s) => ($s['one-session-per-host'] ?? '') === 'no'));
        if (!$longgar) {
            return self::item('satu-sesi', 'PPPoE', 'ok', $judul, 'one-session-per-host=yes di semua server.');
        }

        return self::item('satu-sesi', 'PPPoE', 'peringatan', $judul,
            'one-session-per-host=no di server: ' . implode(', ', $longgar) . '. Router pelanggan yang reconnect bisa meninggalkan sesi ganda yang memakan IP pool dan memecah limit.',
            '/interface pppoe-server server set [find] one-session-per-host=yes');
    }

    private static function radius(array $kv): array
    {
        $judul = 'PPP RADIUS lengkap';
        if ((int) ($kv['radius'] ?? 0) === 0) {
            return self::item('radius', 'PPPoE', 'kritis', $judul,
                'use-radius=yes tetapi tidak ada server RADIUS — pelanggan yang tidak punya secret lokal gagal login.',
                '/radius add service=ppp address=<IP-RADIUS> secret=<secret>');
        }
        if (in_array($kv['interim'] ?? '', ['00:00:00', '0s'], true)) {
            return self::item('radius', 'PPPoE', 'info', $judul,
                'interim-update=0: RADIUS hanya tahu sesi mulai/selesai, pemakaian & status online tidak diperbarui berkala.',
                '/ppp aaa set interim-update=5m');
        }

        return self::item('radius', 'PPPoE', 'ok', $judul, 'RADIUS terpasang dan interim-update aktif.');
    }

    private static function fasttrack(array $kv): array
    {
        $judul = 'FastTrack tidak melewati limit bandwidth';
        $limit = (int) ($kv['queues'] ?? 0) > 0 || ($kv['radius-ppp'] ?? '') === 'true';
        if (!$limit) {
            return self::item('fasttrack', 'Sistem', 'ok', $judul, 'FastTrack aktif dan tidak ada queue yang bisa terlewati.');
        }

        return self::item('fasttrack', 'Sistem', 'peringatan', $judul,
            'FastTrack aktif bersama queue/limit pelanggan. Paket yang di-fasttrack melewati queue, sehingga limit bisa tidak berlaku. '
            . 'Matikan, atau batasi fasttrack hanya untuk trafik yang memang tidak perlu dilimit.',
            '/ip firewall filter disable [find action=fasttrack-connection]');
    }

    // ─── Pembantu ────────────────────────────────────────────────────────────

    /**
     * Drop/reject di chain input yang menangkap SEMUA sisa lalu lintas (boleh dibatasi interface WAN
     * atau "src-address-list=!NOC"), bukan cuma port/protokol tertentu.
     */
    private static function dropMenyeluruh(array $input): bool
    {
        foreach ($input as $r) {
            $ada = fn (string $kunci) => ($r[$kunci] ?? '') !== '';
            if (!in_array($r['action'] ?? '', ['drop', 'reject'], true)
                || $ada('dst-port') || $ada('protocol') || $ada('src-address')
                || ($ada('src-address-list') && !str_starts_with($r['src-address-list'], '!'))
                || ($ada('connection-state') && !str_contains($r['connection-state'], 'new'))) {
                continue;
            }
            return true;
        }

        return false;
    }

    /** Aturan chain input ditambah semua chain yang dicapai lewat "jump" dari sana. */
    private static function aturanInput(array $filter): array
    {
        $chain = ['input' => true];
        do {
            $tambah = false;
            foreach ($filter as $r) {
                $tujuan = $r['jump-target'] ?? '';
                if (($r['action'] ?? '') === 'jump' && isset($chain[$r['chain'] ?? '']) && $tujuan !== '' && !isset($chain[$tujuan])) {
                    $chain[$tujuan] = $tambah = true;
                }
            }
        } while ($tambah);

        return array_values(array_filter($filter, fn ($r) => isset($chain[$r['chain'] ?? ''])));
    }

    /** Alamat NOC diambil dari batas address SSH router itu sendiri — standar yang sudah dipakai di sana. */
    private static function alamatNoc(array $layanan): string
    {
        $ssh = $layanan['ssh']['address'] ?? '';

        return $ssh !== '' ? implode(',', array_unique(explode(',', $ssh))) : '<IP-NOC>';
    }

    private static function ipPublik(string $cidr): bool
    {
        $ip = explode('/', $cidr)[0];
        if (!filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4 | FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) {
            return false;
        }

        // CGNAT 100.64.0.0/10 bukan IP publik.
        return (ip2long($ip) & 0xFFC00000) !== ip2long('100.64.0.0');
    }

    private static function item(string $id, string $kategori, string $status, string $judul, string $detail, ?string $perbaikan = null): array
    {
        return array_filter(compact('id', 'kategori', 'status', 'judul', 'detail', 'perbaikan'), fn ($v) => $v !== null);
    }
}
