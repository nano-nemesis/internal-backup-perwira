<?php

namespace App\Support;

/**
 * Doctor MikroTik: membandingkan konfigurasi router dengan standar Perwira (keamanan, sistem,
 * lisensi CHR, PPPoE, VPN/IP publik). Peran router dideteksi otomatis dari konfigurasinya.
 *
 * Murni, tidak menyentuh router. Data diambil sekali lewat script() (perintah baca saja,
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
        // CHR ROS 7: "Limited Upgrades" di System > License (lisensi lewat tenggat / trial habis). Router lain → "?".
        'license-limited' => '/system license get limited-upgrades',
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
        'radius-acct'   => '/ppp aaa get accounting',
        'tz-name'       => '/system clock get time-zone-name',
        'tz-offset'     => '/system clock get gmt-offset',
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
                // "print count-only" di dalam [] ikut mencetak angkanya di baris sendiri, dilewati.
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
     * Pemeriksaan yang KRITIS di laporan baru tapi tidak kritis di laporan lama (untuk notifikasi
     * Telegram). Tanpa laporan lama yang sah (belum pernah diperiksa / dulu tak terjangkau) tidak
     * ada pembanding, jadi tidak ada yang dianggap "baru": node baru tidak membanjiri grup.
     *
     * @return list<array> daftar cek dari laporan baru
     */
    public static function kritisBaru(?array $lama, array $baru): array
    {
        if (! $lama || isset($lama['galat']) || ! isset($lama['cek'])) {
            return [];
        }
        $dulu = array_column(array_filter($lama['cek'], fn ($c) => $c['status'] === 'kritis'), 'id');

        return array_values(array_filter($baru['cek'] ?? [],
            fn ($c) => $c['status'] === 'kritis' && ! in_array($c['id'], $dulu, true)));
    }

    /**
     * @param array<string, string> $terbaru versi terbaru per kanal, mis. ['a7.long-term' => '7.23.8']
     * @param array|null $standar standar Perwira (DoctorStandar); null = bawaan
     */
    public static function periksa(array $data, array $terbaru = [], ?array $standar = null): array
    {
        $s = DoctorStandar::rapikan($standar);
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
            // Upgrade RouterOS & ubah paket diblokir lisensi; kecepatan tidak berubah.
            'terbatas' => str_starts_with($kv['board'] ?? '', 'CHR') && in_array($kv['license-limited'] ?? '', ['true', 'yes'], true),
        ];
        // Router ber-IP publik tanpa drop menyeluruh = layanan yang terbuka benar-benar terjangkau dari internet.
        $terpapar = $k['publik'] && !$k['drop'];

        // Urutan = prioritas di antara status yang sama: akar masalah (lisensi, firewall) lebih dulu.
        $noc = $s['noc'] ? implode(',', $s['noc']) : self::alamatNoc($layanan);
        $pintu = self::pintu($d, $kv);
        $cek = array_values(array_filter([
            $k['chr'] ? self::lisensi($kv, $s['lisensi_min'], $k['terbatas']) : null,
            self::firewallInput($k, $kv, $d, $publik, $input, $noc, $pintu),
            self::dnsTerbuka($kv, $k, $input, $publik),
            self::aksesManajemen($layanan, $k, $s['layanan_dibatasi'], $noc, $publik, $pintu),
            self::layananPolos($layanan, $terpapar, $s['layanan_mati']),
            self::bandwidthServer($kv, $k, $terpapar),
            self::proxyTerbuka($kv, $terpapar),
            self::snmp($kv, $aktif('snmpc')),
            self::portWinbox($layanan, $s['winbox_port']),
            self::macDanNeighbor($kv, $k),
            self::vpn($kv),
            self::versiTerbatas(self::versi($kv, $k, $terbaru, $s['kanal']), $k['terbatas']),
            self::ntp($kv, $k, $s['ntp']),
            self::sumberDaya($kv, $s['cpu_maks'], $s['ram_min'], $s['disk_min']),
            self::ruteDefault($kv),
            self::zonaWaktu($kv, $s['zona_waktu']),
            $k['pppoe'] ? self::mss($aktif('profile')) : null,
            $k['pppoe'] ? self::satuSesi($aktif('pppoe')) : null,
            $nyala('radius-ppp') ? self::radius($kv, $s['interim']) : null,
            (int) ($kv['fasttrack'] ?? 0) > 0 ? self::fasttrack($kv) : null,
        ]));
        // Standar: pemeriksaan yang dimatikan dibuang; tingkat temuan bisa dipaksa (mis. versi jadi info).
        $cek = array_values(array_filter($cek, fn ($c) => DoctorStandar::aktif($s, $c['id'])));
        // Satu gambar jalur cukup: kalau temuan firewall tampil dengan gambarnya, akses-manajemen tidak mengulangnya.
        $gambarFirewall = in_array('firewall-input', array_column(array_filter($cek, fn ($c) => isset($c['jalur'])), 'id'), true);
        foreach ($cek as &$c) {
            if ($gambarFirewall && $c['id'] === 'akses-manajemen') {
                unset($c['jalur']);
            }
            $tingkat = $s['cek'][$c['id']]['tingkat'] ?? 'otomatis';
            if ($c['status'] !== 'ok' && $tingkat !== 'otomatis') {
                $c['status'] = $tingkat;
            }
        }
        unset($c);
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
            'utama'     => $utama && in_array($utama['status'], ['kritis', 'peringatan'], true) ? $utama['masalah'] ?? $utama['judul'] : null,
            'cek'       => $cek,
        ];
    }

    // ─── Keamanan ────────────────────────────────────────────────────────────

    private static function layananPolos(array $layanan, bool $terpapar, array $wajibMati): ?array
    {
        if (!$wajibMati) {
            return null;
        }
        $judul = DoctorStandar::namaLayanan($wajibMati) . ' dimatikan';
        $nyala = array_values(array_intersect($wajibMati, array_keys($layanan)));
        if (!$nyala) {
            return self::item('layanan-polos', 'Keamanan', 'ok', $judul, count($wajibMati) > 1 ? 'Semuanya mati.' : 'Sudah mati.');
        }
        $tanpaBatas = array_filter($nyala, fn ($n) => ($layanan[$n]['address'] ?? '') === '');
        $polos = array_values(array_intersect($nyala, ['telnet', 'ftp', 'www']));
        $kritis = $terpapar && $tanpaBatas;

        return self::item('layanan-polos', 'Keamanan', $kritis ? 'kritis' : 'peringatan', $judul,
            'Masih menyala di /ip service: ' . self::daftarPort($nyala, $layanan) . '.'
            . ($kritis ? ' Tanpa batas address, dan router ini terbuka ke internet.' : ''),
            implode("\n", array_map(fn ($n) => "/ip service set [find name={$n}] disabled=yes", $nyala)),
            masalah: 'Layanan yang wajib mati masih menyala',
            standar: DoctorStandar::namaLayanan($wajibMati) . ' berstatus disabled di /ip service. Router dikelola lewat Winbox atau SSH saja.',
            dampak: ($polos ? DoctorStandar::namaLayanan($polos) . ' mengirim username dan password tanpa enkripsi: siapa pun di jalur yang sama bisa membacanya. ' : '')
                . ($kritis ? 'Saat ini siapa pun di internet juga bisa mencoba login lewat layanan ini.' : 'Setiap layanan yang menyala adalah satu pintu login lagi yang harus dijaga.'));
    }

    private static function aksesManajemen(array $layanan, array $k, array $dibatasi, string $noc, array $publik, array $pintu): ?array
    {
        if (!$dibatasi) {
            return null;
        }
        $nama = $dibatasi === DoctorStandar::BAWAAN['layanan_dibatasi'] ? 'Winbox, SSH, dan API' : DoctorStandar::namaLayanan($dibatasi);
        $judul = "{$nama} dibatasi alamat NOC";
        $terbuka = array_values(array_filter($dibatasi,
            fn ($n) => isset($layanan[$n]) && ($layanan[$n]['address'] ?? '') === ''));
        if (!$terbuka || !$k['publik']) {
            return self::item('akses-manajemen', 'Keamanan', 'ok', $judul,
                $terbuka ? 'Tidak ada IP publik, jadi layanan tanpa batas alamat hanya terjangkau dari jaringan dalam.' : 'Semua layanan manajemen yang aktif sudah punya batas address.');
        }

        return self::item('akses-manajemen', 'Keamanan', $k['drop'] ? 'info' : 'kritis', $judul,
            'Kolom address kosong (menerima login dari alamat mana pun): ' . self::daftarPort($terbuka, $layanan) . '. '
            . ($k['drop'] ? 'Firewall input sudah men-drop akses dari internet, jadi batas address ini lapis kedua.' : 'Router ber-IP publik dan firewall input tidak men-drop akses dari internet.'),
            implode("\n", array_map(fn ($n) => "/ip service set [find name={$n}] address={$noc}", $terbuka)),
            masalah: "Login {$nama} belum dibatasi ke alamat NOC",
            standar: 'Kolom address di /ip service diisi alamat NOC (' . str_replace(',', ', ', $noc) . '). Login dari alamat lain ditolak walau firewall salah atur.',
            dampak: $k['drop']
                ? 'Kalau suatu hari aturan firewall terhapus atau salah urut, login router langsung terbuka ke internet.'
                : 'Bot di internet terus menebak password Winbox dan SSH. Satu password lemah cukup untuk mengambil alih router.',
            // Setelah batas address: yang diperbaiki hanya dari NOC, layanan lain tetap seperti sekarang.
            jalur: $k['drop'] ? null : self::jalur($publik, 'Kolom address /ip service: login ' . $nama . ' hanya diterima dari NOC (' . str_replace(',', ', ', $noc) . ')',
                array_map(fn ($p) => ['nanti' => $p['vpn'] ? 'vpn' : (in_array($p['id'], $terbuka, true) ? 'noc' : 'tetap')] + $p, $pintu)));
    }

    private static function firewallInput(array $k, array $kv, array $d, array $publik, array $input, string $noc, array $pintu): ?array
    {
        if (!$k['publik']) {
            return null;
        }
        $judul = 'Firewall input menutup akses dari internet';
        if ($k['drop']) {
            return self::item('firewall-input', 'Keamanan', 'ok', $judul, 'Ada aturan drop menyeluruh di chain input.');
        }

        $baris = [
            '# Jalankan dalam Safe Mode (Ctrl+X): kalau koneksi Anda terputus, perubahan dibatalkan otomatis.',
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
        $wan = array_unique(array_column($publik, 'interface'));
        foreach ($wan as $w) {
            $baris[] = "add chain=input in-interface={$w} action=drop comment=\"doctor: drop sisa dari internet\"";
        }
        $ip = implode(', ', array_map(fn ($a) => $a['address'] . (isset($a['interface']) ? " di {$a['interface']}" : ''), $publik));

        return self::item('firewall-input', 'Keamanan', 'kritis', $judul,
            "IP publik {$ip}. Chain input " . ($input ? 'berisi ' . count($input) . ' aturan aktif, tidak satu pun yang membuang sisa lalu lintas dari internet.' : 'kosong, tidak ada aturan sama sekali.'),
            implode("\n", $baris),
            masalah: 'Router terbuka ke internet: firewall input tanpa aturan drop',
            standar: 'Chain input hanya menerima koneksi balik, alamat NOC, ping, dan port VPN yang dipakai pelanggan. Sisanya dari internet di-drop. Perintah di bawah disusun dari VPN yang aktif di router ini.',
            dampak: 'Semua layanan di router ini bisa dijangkau dari internet. Siapa pun bisa mencoba login Winbox atau SSH, menebak password, atau memakai celah RouterOS.',
            // Setelah drop: layanan router hanya dari NOC, port VPN tetap terbuka, PPTP (tak diberi accept) ikut tertutup.
            jalur: self::jalur($publik, 'Firewall input: terima NOC (' . str_replace(',', ', ', $noc) . ') dan port VPN, sisanya di-drop',
                array_map(fn ($p) => ['nanti' => $p['id'] === 'pptp' ? 'tutup' : ($p['vpn'] ? 'vpn' : 'noc')] + $p, $pintu)));
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
                $k['drop'] ? 'Melayani DNS, port 53 dari internet tertutup oleh drop menyeluruh.' : 'Melayani DNS, port 53 dari internet ditutup aturan drop khusus. Pastikan semua interface WAN tercakup.');
        }
        $wan = $publik[0]['interface'] ?? '<interface-WAN>';

        return self::item('dns-terbuka', 'Keamanan', 'kritis', $judul,
            "/ip dns allow-remote-requests=yes, router ber-IP publik ({$publik[0]['address']}), dan tidak ada aturan firewall yang menutup port 53 dari internet.",
            "/ip firewall filter add chain=input in-interface={$wan} protocol=udp dst-port=53 action=drop comment=\"doctor: tutup DNS\"\n"
            . "/ip firewall filter add chain=input in-interface={$wan} protocol=tcp dst-port=53 action=drop comment=\"doctor: tutup DNS\"\n"
            . '# atau, kalau router tidak melayani DNS pelanggan: /ip dns set allow-remote-requests=no',
            masalah: 'DNS router bisa dipakai siapa saja di internet (open resolver)',
            standar: 'DNS router hanya menjawab pelanggan di jaringan dalam. Port 53 dari internet di-drop.',
            dampak: 'Penyerang memakai router ini untuk memperbesar serangan DDoS ke pihak lain (DNS amplification). IP Perwira lalu masuk daftar hitam dan bisa diblokir upstream.');
    }

    private static function bandwidthServer(array $kv, array $k, bool $terpapar): array
    {
        $judul = 'Bandwidth test server mati atau berautentikasi';
        if (($kv['bw-enabled'] ?? '') !== 'true') {
            return self::item('bandwidth-server', 'Keamanan', 'ok', $judul, 'Mati.');
        }
        $perbaikan = '/tool bandwidth-server set enabled=no';
        $standar = 'Bandwidth test server mati, dinyalakan hanya selama uji kecepatan.';
        if (($kv['bw-auth'] ?? '') !== 'true') {
            return self::item('bandwidth-server', 'Keamanan', $terpapar ? 'kritis' : 'peringatan', $judul,
                '/tool bandwidth-server enabled=yes, authenticate=no.' . ($terpapar ? ' Router ini terbuka ke internet.' : ''), $perbaikan,
                masalah: 'Bandwidth test server menyala tanpa password',
                standar: $standar,
                dampak: 'Siapa pun yang bisa menjangkau router dapat menjalankan btest ke sini dan menghabiskan bandwidth uplink.');
        }

        return self::item('bandwidth-server', 'Keamanan', $k['publik'] ? 'info' : 'ok', $judul,
            $k['publik'] ? '/tool bandwidth-server enabled=yes, authenticate=yes.' : 'Aktif dengan autentikasi.', $k['publik'] ? $perbaikan : null,
            masalah: $k['publik'] ? 'Bandwidth test server menyala' : null,
            standar: $k['publik'] ? $standar : null,
            dampak: $k['publik'] ? 'Sudah berpassword, tapi tetap satu layanan lagi yang menerima koneksi dari luar. Matikan kalau tidak rutin dipakai.' : null);
    }

    private static function proxyTerbuka(array $kv, bool $terpapar): array
    {
        $judul = 'SOCKS dan web proxy mati';
        $nama = ['socks' => 'SOCKS (/ip socks)', 'proxy' => 'web proxy (/ip proxy)'];
        $nyala = array_keys(array_filter(['socks' => $kv['socks'] ?? '', 'proxy' => $kv['proxy'] ?? ''], fn ($v) => $v === 'true'));
        if (!$nyala) {
            return self::item('proxy', 'Keamanan', 'ok', $judul, 'Keduanya mati.');
        }

        return self::item('proxy', 'Keamanan', $terpapar ? 'kritis' : 'peringatan', $judul,
            'Menyala: ' . implode(' dan ', array_map(fn ($n) => $nama[$n], $nyala)) . '.' . ($terpapar ? ' Router ini terbuka ke internet.' : ''),
            implode("\n", array_map(fn ($n) => "/ip {$n} set enabled=no", $nyala)),
            masalah: 'SOCKS atau web proxy menyala',
            standar: '/ip socks dan /ip proxy mati.',
            dampak: 'Proxy yang bisa dijangkau dari luar dipakai orang untuk spam dan serangan. Yang tercatat di log korban adalah IP Perwira.');
    }

    private static function snmp(array $kv, array $komunitas): ?array
    {
        $judul = 'SNMP aktif, community dibatasi alamat';
        $pantau = 'SNMP aktif dengan community yang dibatasi ke server monitoring NOC, seperti router Perwira lainnya.';
        $dampak = 'Router tidak terpantau di monitoring NOC (mis. LibreNMS): trafik, CPU, dan status interface tidak tergambar, dan gangguan baru ketahuan dari keluhan pelanggan.';
        $perbaikan = "/snmp set enabled=yes\n/snmp community add name=<community> addresses=<IP-NMS> read-access=yes write-access=no";
        if (($kv['snmp'] ?? '?') === '?') {
            return null;
        }
        if ($kv['snmp'] !== 'true') {
            return self::item('snmp', 'Keamanan', 'peringatan', $judul, '/snmp enabled=no.', $perbaikan,
                masalah: 'SNMP mati: router tidak terpantau', standar: $pantau, dampak: $dampak);
        }
        if (!$komunitas) {
            return self::item('snmp', 'Keamanan', 'peringatan', $judul, 'SNMP menyala, tetapi tidak ada community aktif di /snmp community.',
                '/snmp community add name=<community> addresses=<IP-NMS> read-access=yes write-access=no',
                masalah: 'SNMP menyala tanpa community aktif', standar: $pantau, dampak: $dampak);
        }
        $longgar = array_filter($komunitas, fn ($c) => ($c['name'] ?? '') === 'public'
            || in_array($c['addresses'] ?? '', ['', '0.0.0.0/0', '::/0'], true));
        if (!$longgar) {
            return self::item('snmp', 'Keamanan', 'ok', $judul, 'SNMP aktif, semua community punya batas alamat.');
        }
        $nama = array_column($longgar, 'name');

        return self::item('snmp', 'Keamanan', 'peringatan', $judul,
            'Community terlalu longgar: ' . implode(', ', array_map(fn ($c) => ($c['name'] ?? '?') . ' (addresses=' . (($c['addresses'] ?? '') ?: 'kosong') . ')', $longgar)) . '.',
            implode("\n", array_map(fn ($n) => "/snmp community set [find name=\"{$n}\"] addresses=<IP-NMS>", $nama)),
            masalah: 'SNMP community terlalu longgar',
            standar: 'Setiap community bernama selain "public", dan addresses diisi IP server monitoring (NMS).',
            dampak: 'Siapa pun yang menebak nama community bisa membaca daftar interface, IP, rute, dan grafik trafik router.');
    }

    private static function macDanNeighbor(array $kv, array $k): array
    {
        $judul = 'MAC server & neighbor discovery tidak di semua interface';
        $setelan = [
            'mac-telnet' => '/tool mac-server set allowed-interface-list=none',
            'mac-winbox' => '/tool mac-server mac-winbox set allowed-interface-list=none',
            'neighbor'   => '/ip neighbor discovery-settings set discover-interface-list=none',
        ];
        $nama = ['mac-telnet' => 'MAC Telnet', 'mac-winbox' => 'MAC Winbox', 'neighbor' => 'neighbor discovery'];
        $semua = array_keys(array_filter($setelan, fn ($_, $kunci) => ($kv[$kunci] ?? '') === 'all', ARRAY_FILTER_USE_BOTH));
        if (!$semua || !$k['publik']) {
            return self::item('mac-neighbor', 'Keamanan', 'ok', $judul,
                $semua ? 'Aktif di semua interface, tetapi router tidak punya IP publik.' : 'Sudah dibatasi.');
        }

        return self::item('mac-neighbor', 'Keamanan', 'peringatan', $judul,
            'Bernilai "all" (aktif di semua interface, termasuk WAN): ' . implode(', ', array_map(fn ($kunci) => $nama[$kunci], $semua)) . '.',
            implode("\n", array_map(fn ($kunci) => $setelan[$kunci], $semua)),
            masalah: 'MAC Winbox atau neighbor discovery aktif di semua interface',
            standar: 'Interface list "none", atau interface list LAN kalau akses lewat MAC dari dalam masih dibutuhkan.',
            dampak: 'Perangkat lain di segmen yang sama (VLAN datacenter, upstream) bisa melihat router ini dan membuka Winbox lewat MAC, tanpa melewati firewall IP.');
    }

    private static function vpn(array $kv): ?array
    {
        $judul = 'Server VPN memakai protokol yang aman';
        if (($kv['pptp'] ?? '') === 'true') {
            return self::item('vpn', 'VPN', 'peringatan', $judul,
                '/interface pptp-server enabled=yes.',
                '/interface pptp-server server set enabled=no',
                masalah: 'Server PPTP masih menyala',
                standar: 'VPN memakai L2TP/IPsec, SSTP, atau WireGuard. PPTP mati. Pindahkan klien dulu sebelum mematikannya.',
                dampak: 'Enkripsi PPTP (MS-CHAPv2) sudah bisa dibobol dalam hitungan jam: password dan isi tunnel bisa dibaca.');
        }
        if (($kv['l2tp'] ?? '') === 'true' && ($kv['l2tp-ipsec'] ?? '') === 'no') {
            return self::item('vpn', 'VPN', 'info', $judul,
                '/interface l2tp-server enabled=yes, use-ipsec=no.',
                masalah: 'L2TP berjalan tanpa IPsec',
                standar: 'Wajar untuk layanan IP publik pelanggan yang mengutamakan kompatibilitas. Untuk akses manajemen pakai L2TP dengan IPsec, SSTP, atau WireGuard.',
                dampak: 'Isi tunnel tidak dienkripsi: siapa pun di jalur internet antara klien dan router bisa membacanya.');
        }

        return null;
    }

    // ─── Sistem ──────────────────────────────────────────────────────────────

    private static function versi(array $kv, array $k, array $terbaru, string $kanalStandar = 'ikuti'): ?array
    {
        if (!preg_match('/^(\S+)\s*\(([\w-]+)\)/', $kv['version'] ?? '', $m)) {
            return null;
        }
        [, $v, $kanal] = $m;
        $judul = 'RouterOS versi terbaru di kanalnya';
        if ($kanalStandar !== 'ikuti' && $kanal !== $kanalStandar && in_array($kanal, ['long-term', 'stable', 'testing', 'development'], true)) {
            return self::item('versi', 'Sistem', 'peringatan', $judul,
                "Terpasang {$v} di kanal {$kanal}.",
                "/system package update set channel={$kanalStandar}\n/system package update check-for-updates",
                masalah: 'RouterOS di kanal yang berbeda dari standar',
                standar: "Kanal {$kanalStandar}. Kalau versi di kanal itu lebih lama, pindahnya lewat /system package downgrade.",
                dampak: 'Kanal menentukan seberapa cepat perbaikan datang dan seberapa stabil versinya. Router di kanal berbeda sulit diseragamkan.');
        }
        $baru = $terbaru[($k['mayor'] >= 7 ? 'a7.' : '6.') . $kanal] ?? null;
        if (!$baru) {
            return self::item('versi', 'Sistem', 'info', $judul, "Terpasang {$v} ({$kanal}). Versi terbaru tidak bisa dicek dari server MikroTik.",
                masalah: 'Versi terbaru RouterOS tidak bisa dicek');
        }
        $catatanV6 = $k['mayor'] < 7 ? 'RouterOS 6 tinggal menerima perbaikan kecil; fitur dan perbaikan keamanan baru hanya ada di v7. Rencanakan migrasi.' : '';
        if (version_compare($v, $baru, '>=')) {
            return self::item('versi', 'Sistem', $catatanV6 ? 'info' : 'ok', $judul, "Terpasang {$v}, sudah terbaru di kanal {$kanal}.",
                masalah: $catatanV6 ? 'Masih RouterOS 6' : null, standar: $catatanV6 ? 'RouterOS 7.' : null, dampak: $catatanV6 ?: null);
        }

        return self::item('versi', 'Sistem', 'peringatan', $judul,
            "Terpasang {$v}. Terbaru di kanal {$kanal}: {$baru}.",
            "/system package update set channel={$kanal}\n/system package update install",
            masalah: 'RouterOS belum versi terbaru',
            standar: "Versi terbaru di kanal {$kanal}.",
            dampak: trim("Pembaruan memuat perbaikan celah keamanan dan bug. Router reboot saat dipasang, jadi kerjakan di luar jam sibuk. {$catatanV6}"));
    }

    /** Upgrade diblokir lisensi (Limited Upgrades): saran pembaruan tidak bisa dijalankan, jadi cukup catatan. */
    private static function versiTerbatas(?array $c, bool $terbatas): ?array
    {
        if (!$c || !$terbatas || $c['status'] !== 'peringatan') {
            return $c;
        }
        unset($c['perbaikan']);

        return array_merge($c, [
            'status'  => 'info',
            'masalah' => 'RouterOS belum terbaru, upgrade tertahan lisensi',
            'dampak'  => 'Limited Upgrades tercentang di System > License, jadi router ini memang tidak bisa di-upgrade sampai lisensinya aktif kembali. Dicatat sebagai info saja.',
        ]);
    }

    private static function ntp(array $kv, array $k, array $server): array
    {
        $judul = 'Jam router disinkronkan NTP';
        if (($kv['ntp'] ?? '') === 'true') {
            return self::item('ntp', 'Sistem', 'ok', $judul, 'NTP client aktif.');
        }
        $server = $server ?: DoctorStandar::BAWAAN['ntp'];

        return self::item('ntp', 'Sistem', 'peringatan', $judul,
            '/system ntp client enabled=no.',
            ($k['mayor'] >= 7 ? '/system ntp client set enabled=yes servers=' : '/system ntp client set enabled=yes server-dns-names=')
            . implode(',', $server),
            masalah: 'Jam router tidak disinkronkan',
            standar: 'NTP client aktif ke ' . implode(', ', $server) . '.',
            dampak: 'Jam router meleset. Waktu di log tidak cocok saat menelusuri gangguan, script terjadwal jalan di jam yang salah, dan SSTP bisa gagal karena sertifikat dianggap kedaluwarsa.');
    }

    private static function sumberDaya(array $kv, int $cpuMaks = 80, int $ramMin = 10, int $diskMin = 10): ?array
    {
        if (!is_numeric($kv['cpu'] ?? null)) {
            return null;
        }
        $persen = fn (string $a, string $b) => is_numeric($kv[$a] ?? null) && (float) ($kv[$b] ?? 0) > 0
            ? (int) round($kv[$a] / $kv[$b] * 100) : null;
        $ram = $persen('mem-free', 'mem-total');
        $disk = $persen('hdd-free', 'hdd-total');
        $masalah = array_filter([
            (int) $kv['cpu'] >= $cpuMaks ? "CPU {$kv['cpu']}% (batas {$cpuMaks}%)" : null,
            $ram !== null && $ram < $ramMin ? "RAM bebas {$ram}% (minimal {$ramMin}%)" : null,
            $disk !== null && $disk < $diskMin ? "disk bebas {$disk}% (minimal {$diskMin}%)" : null,
        ]);
        $detail = "CPU {$kv['cpu']}%, RAM bebas " . ($ram ?? '?') . '%, disk bebas ' . ($disk ?? '?') . '%.';
        if (!$masalah) {
            return self::item('sumber-daya', 'Sistem', 'ok', 'CPU, RAM, dan disk cukup longgar', $detail);
        }

        // Batang: CPU dinilai dari yang terpakai (maksimal), RAM & disk dari yang bebas (minimal).
        $meter = array_values(array_filter([
            ['label' => 'CPU terpakai', 'nilai' => (int) $kv['cpu'], 'batas' => $cpuMaks, 'arah' => 'maks'],
            $ram === null ? null : ['label' => 'RAM bebas', 'nilai' => $ram, 'batas' => $ramMin, 'arah' => 'min'],
            $disk === null ? null : ['label' => 'Disk bebas', 'nilai' => $disk, 'batas' => $diskMin, 'arah' => 'min'],
        ]));

        return self::item('sumber-daya', 'Sistem', 'peringatan', 'CPU, RAM, dan disk cukup longgar',
            'Menipis: ' . implode(', ', $masalah) . ". Lengkapnya: {$detail}",
            masalah: 'CPU, RAM, atau disk router menipis',
            standar: "CPU di bawah {$cpuMaks}%, RAM bebas minimal {$ramMin}%, disk bebas minimal {$diskMin}%.",
            dampak: 'CPU atau RAM yang habis membuat ping naik dan paket hilang di jam sibuk. Disk penuh membuat backup dan pembaruan RouterOS gagal.',
            meter: $meter);
    }

    private static function portWinbox(array $layanan, int $port): ?array
    {
        if (!isset($layanan['winbox'])) {
            return null;
        }
        $kini = $layanan['winbox']['port'] ?? '?';
        $judul = "Winbox di port {$port}";
        if ((string) $kini === (string) $port) {
            return self::item('winbox-port', 'Keamanan', 'ok', $judul, "Winbox di port {$kini}.");
        }

        return self::item('winbox-port', 'Keamanan', 'peringatan', $judul,
            "Winbox di port {$kini}" . ($kini === '8291' ? ' (bawaan MikroTik).' : '.'),
            "# Koneksi Winbox yang sedang terbuka akan terputus; sambung ulang ke port {$port}.\n/ip service set [find name=winbox] port={$port}",
            masalah: 'Winbox tidak di port standar Perwira',
            standar: "Winbox di port {$port}, sama di semua router Perwira.",
            dampak: 'Port bawaan 8291 adalah yang pertama dicoba bot pemindai Winbox. Port yang berbeda dari router lain juga membuat bookmark Winbox NOC dan aturan firewall yang menyebut port ini tidak berlaku di sini.');
    }

    private static function zonaWaktu(array $kv, string $zona): ?array
    {
        $nama = $kv['tz-name'] ?? '?';
        if ($nama === '?' || $nama === '') {
            return null;
        }
        $judul = "Zona waktu {$zona}";
        $standar = self::offset($zona);
        // Zona manual (mis. +07:00) yang offset-nya sama dengan standar dianggap setara.
        $router = $nama === 'manual' ? self::offsetTeks($kv['tz-offset'] ?? '') : self::offset($nama);
        if ($nama === $zona || ($nama === 'manual' && $router === $standar)) {
            return self::item('zona-waktu', 'Sistem', 'ok', $judul, $nama === 'manual' ? 'Zona manual ' . self::utc($router) . ", sama dengan {$zona}." : "time-zone-name={$nama}.");
        }
        $selisih = $router === null || $standar === null || $router === $standar ? ''
            : ' Jam router ' . self::durasi(abs($router - $standar)) . ($router > $standar ? ' lebih maju' : ' lebih lambat') . " dari {$zona}.";

        return self::item('zona-waktu', 'Sistem', 'peringatan', $judul,
            "time-zone-name={$nama}" . ($nama === 'manual' ? ' (' . self::utc($router) . ')' : '') . ".{$selisih}",
            "/system clock set time-zone-autodetect=no time-zone-name={$zona}",
            masalah: 'Zona waktu router berbeda dari standar',
            standar: "time-zone-name={$zona}, autodetect dimatikan supaya tidak berubah mengikuti lokasi IP.",
            dampak: 'Jam di log, scheduler, dan grafik router tidak sama dengan jam NOC dan aplikasi backup. Saat menelusuri gangguan, waktu log harus dihitung ulang dan mudah salah.');
    }

    private static function ruteDefault(array $kv): ?array
    {
        if (!ctype_digit($kv['default-route'] ?? '')) {
            return null;
        }

        return (int) $kv['default-route'] > 0
            ? self::item('rute-default', 'Sistem', 'ok', 'Ada rute default yang aktif', 'Rute 0.0.0.0/0 aktif.')
            : self::item('rute-default', 'Sistem', 'info', 'Ada rute default yang aktif',
                'Tidak ada rute 0.0.0.0/0 yang berstatus active.',
                masalah: 'Tidak ada rute default yang aktif',
                standar: 'Ada satu rute default aktif, kecuali router ini memang sengaja tanpa internet.',
                dampak: 'Router sendiri tidak bisa ke internet: cek pembaruan, NTP, dan DNS dari router gagal.');
    }

    // ─── CHR ─────────────────────────────────────────────────────────────────

    private static function lisensi(array $kv, string $minimal = 'p1', bool $terbatas = false): array
    {
        $level = $kv['license'] ?? '?';
        $judul = $minimal === 'p1' ? 'Lisensi CHR berbayar (P1 ke atas)' : 'Lisensi CHR minimal ' . strtoupper($minimal);
        $batas = ['free' => '1 Mbps', 'p1' => '1 Gbps', 'p10' => '10 Gbps'];
        $standar = 'Minimal ' . strtoupper($minimal) . (isset($batas[$minimal]) ? " (batas {$batas[$minimal]} per interface)." : ' (tanpa batas kecepatan).');
        $perbaikan = "/system license renew account=<akun-mikrotik> password=<password> level={$minimal}";
        $urutan = DoctorStandar::LISENSI;
        // Lisensi berbayar yang memenuhi standar tapi "Limited Upgrades" tercentang: cukup catatan (keputusan Risaa).
        if ($terbatas && isset($urutan[$level]) && $level !== 'free' && $urutan[$level] >= $urutan[$minimal]) {
            return self::item('lisensi', 'CHR', 'info', $judul,
                'Lisensi ' . strtoupper($level) . (isset($batas[$level]) ? " (batas {$batas[$level]} per interface)" : ' (tanpa batas kecepatan)')
                . ', dan Limited Upgrades tercentang di System > License (limited-upgrades=yes).',
                "# Lihat tenggat lisensi (deadline-at, next-renewal-at):\n/system license print\n"
                . '# Router harus bisa menghubungi server lisensi MikroTik. Lisensi yang sudah kedaluwarsa hanya bisa diaktifkan lagi dengan Prepaid key.',
                masalah: 'Lisensi CHR: Limited Upgrades tercentang',
                standar: 'limited-upgrades=no: lisensi aktif dan tersambung ke server lisensi MikroTik.',
                dampak: 'Router tetap berjalan dengan kecepatan lisensinya. Yang tertahan: RouterOS tidak bisa di-upgrade dan paket tidak bisa dipasang, diaktifkan, atau dimatikan. Dicatat sebagai info saja.');
        }
        // Berbayar tapi di bawah minimal standar (mis. P1 saat standar P10): perhatian, bukan kritis.
        if (isset($urutan[$level]) && $level !== 'free' && $urutan[$level] < $urutan[$minimal]) {
            return self::item('lisensi', 'CHR', 'peringatan', $judul,
                'Lisensi ' . strtoupper($level) . " (batas {$batas[$level]} per interface).", $perbaikan,
                masalah: 'Lisensi CHR di bawah standar',
                standar: $standar,
                dampak: "Trafik di atas {$batas[$level]} per interface dipotong lisensi, walau server dan uplink mampu lebih.");
        }

        return match ($level) {
            'free' => self::item('lisensi', 'CHR', 'kritis', $judul, 'Lisensi free (batas 1 Mbps per interface).', $perbaikan,
                masalah: 'CHR memakai lisensi free',
                standar: $standar,
                dampak: 'Lisensi free membatasi kecepatan 1 Mbps per interface: pelanggan di belakang CHR ini praktis tidak bisa dipakai.'),
            'p1' => self::item('lisensi', 'CHR', 'ok', $judul, 'Lisensi P1 (batas 1 Gbps per interface).'),
            'p10' => self::item('lisensi', 'CHR', 'ok', $judul, 'Lisensi P10 (batas 10 Gbps per interface).'),
            'unlimited', 'p-unlimited' => self::item('lisensi', 'CHR', 'ok', $judul, 'Lisensi unlimited.'),
            default => self::item('lisensi', 'CHR', 'info', $judul, "Level lisensi terbaca \"{$level}\". Cek manual dengan /system license print.",
                masalah: 'Level lisensi CHR tidak terbaca'),
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
            'change-tcp-mss=no di profil: ' . implode(', ', $tanpa) . '.',
            implode("\n", array_map(fn ($n) => "/ppp profile set [find name=\"{$n}\"] change-tcp-mss=yes", $tanpa)),
            masalah: 'Profil PPP tanpa MSS clamping',
            standar: 'change-tcp-mss=yes (atau default) di semua profil PPP.',
            dampak: 'MTU PPPoE lebih kecil dari Ethernet (1500). Tanpa MSS clamping, sebagian situs dan aplikasi (HTTPS, m-banking) macet saat dibuka walau ping lancar. Keluhan khasnya "bisa WhatsApp tapi web tertentu tidak kebuka".');
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
            'one-session-per-host=no di PPPoE server: ' . implode(', ', $longgar) . '.',
            '/interface pppoe-server server set [find] one-session-per-host=yes',
            masalah: 'PPPoE server mengizinkan sesi ganda per perangkat',
            standar: 'one-session-per-host=yes di semua PPPoE server.',
            dampak: 'Saat router pelanggan reconnect, sesi lamanya bisa tertinggal. Sesi ganda memakan IP pool dan membuat limit kecepatan pelanggan terpecah.');
    }

    private static function radius(array $kv, string $interim = '5m'): array
    {
        $judul = 'PPP RADIUS lengkap';
        if ((int) ($kv['radius'] ?? 0) === 0) {
            return self::item('radius', 'PPPoE', 'kritis', $judul,
                '/ppp aaa use-radius=yes, tetapi daftar /radius kosong.',
                '/radius add service=ppp address=<IP-RADIUS> secret=<secret>',
                masalah: 'PPP memakai RADIUS tapi server RADIUS belum diisi',
                standar: 'Ada minimal satu server di /radius dengan service=ppp.',
                dampak: 'Pelanggan yang tidak punya secret lokal di router gagal login PPPoE.');
        }
        if (in_array($kv['radius-acct'] ?? '', ['false', 'no'], true)) {
            return self::item('radius', 'PPPoE', 'info', $judul,
                '/ppp aaa use-radius=yes, accounting=no.',
                "/ppp aaa set accounting=yes interim-update={$interim}",
                masalah: 'RADIUS accounting mati',
                standar: "accounting=yes dengan interim-update={$interim}, supaya RADIUS mencatat setiap sesi.",
                dampak: 'RADIUS hanya dipakai untuk login. Sesi online, lama sambung, dan pemakaian tidak tercatat, dan batas login ganda (simultaneous-use) di RADIUS tidak bisa ditegakkan.');
        }
        if (in_array($kv['interim'] ?? '', ['00:00:00', '0s'], true)) {
            return self::item('radius', 'PPPoE', 'info', $judul,
                '/ppp aaa interim-update=0 (mati).',
                "/ppp aaa set interim-update={$interim}",
                masalah: 'RADIUS tanpa interim-update',
                standar: "interim-update={$interim}.",
                dampak: 'RADIUS hanya tahu kapan sesi mulai dan selesai. Status online dan pemakaian pelanggan tidak diperbarui selama sesi berjalan.');
        }

        return self::item('radius', 'PPPoE', 'ok', $judul, 'RADIUS terpasang dan interim-update aktif.');
    }

    private static function fasttrack(array $kv): array
    {
        $judul = 'FastTrack tidak melewati limit bandwidth';
        $limit = array_filter([
            (int) ($kv['queues'] ?? 0) > 0 ? "{$kv['queues']} simple queue" : null,
            ($kv['radius-ppp'] ?? '') === 'true' ? 'limit PPP dari RADIUS' : null,
        ]);
        if (!$limit) {
            return self::item('fasttrack', 'Sistem', 'ok', $judul, 'FastTrack aktif dan tidak ada queue yang bisa terlewati.');
        }

        return self::item('fasttrack', 'Sistem', 'peringatan', $judul,
            "{$kv['fasttrack']} aturan fasttrack-connection aktif, bersama " . implode(' dan ', $limit) . '.',
            '/ip firewall filter disable [find action=fasttrack-connection]',
            masalah: 'FastTrack bisa melewati limit pelanggan',
            standar: 'FastTrack mati, atau dibatasi hanya untuk trafik yang memang tidak perlu dilimit.',
            dampak: 'Paket yang di-fasttrack tidak melewati queue. Pelanggan bisa mendapat kecepatan di atas paketnya, dan pemakaian tidak terhitung adil.');
    }

    /**
     * Pintu masuk router untuk gambar jalur: /ip service yang aktif dan port VPN yang menyala.
     * Entri dinamis (D) = koneksi yang sedang berjalan atau port VPN (ditangani terpisah); reverse-proxy = SSTP pelanggan.
     */
    private static function pintu(array $d, array $kv): array
    {
        $pintu = [];
        foreach ($d['service'] ?? [] as $s) {
            $n = $s['name'] ?? '';
            if (preg_match('/[XDI]/', $s['_flags']) || $n === '' || $n === 'reverse-proxy') {
                continue;
            }
            $pintu[] = ['id' => $n, 'nama' => DoctorStandar::LAYANAN[$n] ?? $n, 'port' => 'tcp ' . ($s['port'] ?? '?'),
                'kini' => ($s['address'] ?? '') === '' ? 'terbuka' : 'dibatasi', 'vpn' => false];
        }
        $vpn = fn (string $id, string $nama, string $port) => ['id' => $id, 'nama' => $nama, 'port' => $port, 'kini' => 'terbuka', 'vpn' => true];
        if (($kv['l2tp'] ?? '') === 'true') {
            $pintu[] = $vpn('l2tp', 'L2TP/IPsec', 'udp 500,1701,4500');
        }
        if (($kv['sstp'] ?? '') === 'true') {
            $pintu[] = $vpn('sstp', 'SSTP', 'tcp ' . (ctype_digit($kv['sstp-port'] ?? '') ? $kv['sstp-port'] : '443'));
        }
        foreach ($d['service'] ?? [] as $s) {
            if (str_starts_with($s['name'] ?? '', 'wireguard') && ctype_digit($s['port'] ?? '')) {
                $pintu[] = $vpn('wireguard', 'WireGuard', "udp {$s['port']}");
            }
        }
        if (($kv['pptp'] ?? '') === 'true') {
            $pintu[] = $vpn('pptp', 'PPTP', 'tcp 1723');
        }

        return $pintu;
    }

    /** Data gambar "sekarang vs setelah perbaikan" di panel Doctor. */
    private static function jalur(array $publik, string $gerbang, array $layanan): array
    {
        return [
            'wan'     => implode(', ', array_unique(array_column($publik, 'interface'))),
            'gerbang' => $gerbang,
            'layanan' => array_map(fn ($p) => array_intersect_key($p, array_flip(['nama', 'port', 'kini', 'nanti'])), $layanan),
        ];
    }

    /** Offset UTC sebuah zona IANA saat ini, dalam detik; null kalau namanya tak dikenal. */
    private static function offset(string $zona): ?int
    {
        try {
            return (new \DateTimeZone($zona))->getOffset(new \DateTimeImmutable('now'));
        } catch (\Exception) {
            return null;
        }
    }

    /** gmt-offset RouterOS: "+07:00" (v7), "+07:00:00", atau detik "25200" (v6). */
    private static function offsetTeks(string $s): ?int
    {
        if (preg_match('/^-?\d+$/', $s)) {
            return (int) $s;
        }
        if (preg_match('/^([+-]?)(\d{1,2}):(\d{2})/', $s, $m)) {
            return ($m[1] === '-' ? -1 : 1) * ((int) $m[2] * 3600 + (int) $m[3] * 60);
        }

        return null;
    }

    /** 25200 → "UTC+07:00" */
    private static function utc(?int $detik): string
    {
        return $detik === null ? 'offset tak terbaca' : 'UTC' . ($detik < 0 ? '-' : '+') . gmdate('H:i', abs($detik));
    }

    /** 12600 → "3 jam 30 menit" */
    private static function durasi(int $detik): string
    {
        $jam = intdiv($detik, 3600);
        $menit = intdiv($detik % 3600, 60);

        return trim(($jam ? "{$jam} jam" : '') . ($menit ? " {$menit} menit" : ''));
    }

    /** "winbox (tcp 8291), ssh (tcp 22)" dari /ip service. */
    private static function daftarPort(array $nama, array $layanan): string
    {
        return implode(', ', array_map(fn ($n) => (DoctorStandar::LAYANAN[$n] ?? $n)
            . (isset($layanan[$n]['port']) ? " (tcp {$layanan[$n]['port']})" : ''), $nama));
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

    /** Alamat NOC diambil dari batas address SSH router itu sendiri, standar yang sudah dipakai di sana. */
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

    /**
     * judul = bunyi standarnya (dipakai saat lolos), masalah = bunyi pelanggarannya (judul temuan & "utama"),
     * detail = apa yang terbaca di router ini, standar = yang diminta Perwira, dampak = akibatnya kalau dibiarkan.
     * jalur/meter = data gambar di panel Doctor.
     */
    private static function item(string $id, string $kategori, string $status, string $judul, string $detail, ?string $perbaikan = null,
        ?string $masalah = null, ?string $standar = null, ?string $dampak = null, ?array $jalur = null, ?array $meter = null): array
    {
        return array_filter(compact('id', 'kategori', 'status', 'judul', 'masalah', 'detail', 'standar', 'dampak', 'perbaikan', 'jalur', 'meter'),
            fn ($v) => $v !== null);
    }
}
