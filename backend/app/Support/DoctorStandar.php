<?php

namespace App\Support;

/**
 * Standar Perwira yang dipakai Doctor, bisa diatur admin dari menu Doctor > Standar.
 * Disimpan sebagai JSON di setting "doctor.standar"; kunci yang tidak diisi memakai BAWAAN,
 * jadi laporan lama tetap sama sampai standar diubah. Fungsi murni, diuji di tests/router-doctor.php.
 */
final class DoctorStandar
{
    /** Layanan /ip service yang bisa dipilih di standar, dengan nama tampilan. */
    public const LAYANAN = [
        'telnet' => 'Telnet', 'ftp' => 'FTP', 'www' => 'www (HTTP)', 'www-ssl' => 'www-ssl (HTTPS)',
        'api' => 'API', 'api-ssl' => 'API-SSL', 'winbox' => 'Winbox', 'ssh' => 'SSH',
    ];

    public const LISENSI = ['free' => 0, 'p1' => 1, 'p10' => 2, 'unlimited' => 3, 'p-unlimited' => 3];

    public const TINGKAT = ['otomatis', 'kritis', 'peringatan', 'info'];

    /** Semua pemeriksaan Doctor: judul ringkas, kategori, dan router yang dikenai. */
    public const CEK = [
        'lisensi'          => ['Lisensi CHR berbayar', 'CHR', ['CHR']],
        'firewall-input'   => ['Firewall input menutup akses dari internet', 'Keamanan', ['IP Publik']],
        'dns-terbuka'      => ['DNS tidak menjadi open resolver', 'Keamanan', ['IP Publik']],
        'akses-manajemen'  => ['Layanan manajemen dibatasi alamat NOC', 'Keamanan', ['IP Publik']],
        'layanan-polos'    => ['Layanan yang wajib mati', 'Keamanan', ['Semua']],
        'bandwidth-server' => ['Bandwidth test server mati atau berautentikasi', 'Keamanan', ['Semua']],
        'proxy'            => ['SOCKS dan web proxy mati', 'Keamanan', ['Semua']],
        'snmp'             => ['SNMP community dibatasi alamat', 'Keamanan', ['SNMP aktif']],
        'mac-neighbor'     => ['MAC server & neighbor discovery dibatasi', 'Keamanan', ['IP Publik']],
        'vpn'              => ['Server VPN memakai protokol yang aman', 'VPN', ['Server VPN']],
        'versi'            => ['RouterOS versi terbaru di kanalnya', 'Sistem', ['Semua']],
        'ntp'              => ['Jam router disinkronkan NTP', 'Sistem', ['Semua']],
        'sumber-daya'      => ['CPU, RAM, dan disk cukup longgar', 'Sistem', ['Semua']],
        'rute-default'     => ['Ada rute default yang aktif', 'Sistem', ['Semua']],
        'fasttrack'        => ['FastTrack tidak melewati limit bandwidth', 'Sistem', ['FastTrack aktif']],
        'mss'              => ['Profil PPP mengubah TCP MSS', 'PPPoE', ['PPPoE Server']],
        'satu-sesi'        => ['PPPoE server: satu sesi per perangkat', 'PPPoE', ['PPPoE Server']],
        'radius'           => ['PPP RADIUS lengkap', 'PPPoE', ['PPPoE + RADIUS']],
    ];

    public const BAWAAN = [
        // Kosong = pakai batas address SSH router itu sendiri (standar yang sudah berjalan di sana).
        'noc'              => [],
        'layanan_mati'     => ['telnet', 'ftp', 'www'],
        'layanan_dibatasi' => ['winbox', 'ssh', 'api', 'api-ssl', 'www-ssl'],
        'lisensi_min'      => 'p1',
        // "ikuti" = bandingkan dengan versi terbaru di kanal yang dipakai router itu sendiri.
        'kanal'            => 'ikuti',
        'ntp'              => ['id.pool.ntp.org', 'time.google.com'],
        'cpu_maks'         => 80,
        'ram_min'          => 10,
        'disk_min'         => 10,
        'interim'          => '5m',
        // id => ['aktif' => bool, 'tingkat' => otomatis|kritis|peringatan|info]
        'cek'              => [],
    ];

    public const KUNCI = 'doctor.standar';

    /** Standar yang tersimpan (setting doctor.standar), sudah dirapikan. */
    public static function tersimpan(): array
    {
        return self::rapikan(json_decode((string) \App\Models\Setting::get(self::KUNCI), true) ?: null);
    }

    /** Gabungkan masukan dengan BAWAAN dan buang nilai yang tidak dikenal. */
    public static function rapikan(?array $s): array
    {
        $s = array_merge(self::BAWAAN, array_intersect_key($s ?? [], self::BAWAAN));
        $daftar = fn ($v) => array_values(array_unique(array_filter(array_map('trim', (array) $v), fn ($x) => $x !== '')));

        $s['noc'] = array_values(array_filter($daftar($s['noc']), [self::class, 'alamatSah']));
        $s['ntp'] = array_values(array_filter($daftar($s['ntp']), fn ($h) => (bool) preg_match('/^[a-z0-9][a-z0-9.-]{0,252}$/i', $h)));
        $s['layanan_mati'] = array_values(array_intersect($daftar($s['layanan_mati']), array_keys(self::LAYANAN)));
        $s['layanan_dibatasi'] = array_values(array_intersect($daftar($s['layanan_dibatasi']), array_keys(self::LAYANAN)));
        $s['lisensi_min'] = in_array($s['lisensi_min'], ['p1', 'p10', 'unlimited'], true) ? $s['lisensi_min'] : 'p1';
        $s['kanal'] = in_array($s['kanal'], ['ikuti', 'long-term', 'stable'], true) ? $s['kanal'] : 'ikuti';
        $s['cpu_maks'] = max(50, min(100, (int) $s['cpu_maks']));
        $s['ram_min'] = max(1, min(50, (int) $s['ram_min']));
        $s['disk_min'] = max(1, min(50, (int) $s['disk_min']));
        $s['interim'] = preg_match('/^(\d+[smhd]?|\d{2}:\d{2}:\d{2})$/', (string) $s['interim']) ? (string) $s['interim'] : '5m';

        $cek = [];
        foreach ((array) $s['cek'] as $id => $c) {
            if (isset(self::CEK[$id]) && is_array($c)) {
                $cek[$id] = [
                    'aktif'   => (bool) ($c['aktif'] ?? true),
                    'tingkat' => in_array($c['tingkat'] ?? '', self::TINGKAT, true) ? $c['tingkat'] : 'otomatis',
                ];
            }
        }
        $s['cek'] = $cek;

        return $s;
    }

    public static function aktif(array $s, string $id): bool
    {
        return $s['cek'][$id]['aktif'] ?? true;
    }

    /** "Telnet, FTP, dan www (HTTP)" */
    public static function namaLayanan(array $daftar): string
    {
        $nama = array_map(fn ($l) => self::LAYANAN[$l] ?? $l, $daftar);

        return count($nama) <= 1 ? implode('', $nama) : implode(', ', array_slice($nama, 0, -1)) . ' dan ' . end($nama);
    }

    public static function alamatSah(string $a): bool
    {
        [$ip, $prefix] = array_pad(explode('/', $a, 2), 2, null);

        return (bool) filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)
            && ($prefix === null || (ctype_digit($prefix) && (int) $prefix <= 32));
    }

    /**
     * Konfigurasi dasar router baru (CHR ber-IP publik) sesuai standar ini. Bagian yang
     * pemeriksaannya dimatikan tidak ikut. Bagian VPN dan PPPoE dipakai bila perannya sesuai.
     */
    public static function skripDasar(array $s): string
    {
        $on = fn (string $id) => self::aktif($s, $id);
        $noc = $s['noc'] ? implode(',', $s['noc']) : '<IP-NOC>';
        $b = [
            '# Skrip dasar router Perwira, disusun dari Standar Doctor.',
            '# Jalankan dalam Safe Mode (Ctrl+X): kalau koneksi Anda terputus, perubahan dibatalkan otomatis.',
            '# Baca baris demi baris; sesuaikan nama interface sebelum menempel.',
        ];

        if ($on('layanan-polos') || $on('akses-manajemen') || $on('firewall-input')) {
            $b[] = '';
            $b[] = '# Alamat NOC';
            foreach ($s['noc'] ?: ['<IP-NOC>'] as $a) {
                $b[] = "/ip firewall address-list add list=NOC address={$a}";
            }
        }
        if ($on('layanan-polos') && $s['layanan_mati']) {
            $b[] = '';
            $b[] = '# Layanan yang wajib mati';
            foreach ($s['layanan_mati'] as $l) {
                $b[] = "/ip service set [find name={$l}] disabled=yes";
            }
        }
        $dibatasi = array_diff($s['layanan_dibatasi'], $on('layanan-polos') ? $s['layanan_mati'] : []);
        if ($on('akses-manajemen') && $dibatasi) {
            $b[] = '';
            $b[] = '# Layanan manajemen hanya dari NOC';
            foreach ($dibatasi as $l) {
                $b[] = "/ip service set [find name={$l}] address={$noc}";
            }
        }
        if ($on('firewall-input')) {
            array_push($b, '',
                '# Firewall input: interface internet dikumpulkan di interface list WAN',
                '/interface list add name=WAN',
                '/interface list member add list=WAN interface=ether1',
                '/ip firewall filter',
                'add chain=input connection-state=established,related action=accept comment="standar: koneksi balik"',
                'add chain=input connection-state=invalid action=drop comment="standar: invalid"',
                'add chain=input src-address-list=NOC action=accept comment="standar: NOC"',
                'add chain=input protocol=icmp action=accept comment="standar: ping"',
                '# Server VPN: buka hanya port yang memang dilayani, sebelum baris drop.',
                '# add chain=input protocol=udp dst-port=500,1701,4500 action=accept comment="standar: L2TP/IPsec"',
                '# add chain=input protocol=ipsec-esp action=accept comment="standar: IPsec"',
                '# add chain=input protocol=tcp dst-port=443 action=accept comment="standar: SSTP"',
                'add chain=input in-interface-list=WAN action=drop comment="standar: drop sisa dari internet"');
        }
        $sistem = array_filter([
            $on('bandwidth-server') ? '/tool bandwidth-server set enabled=no' : null,
            $on('proxy') ? '/ip socks set enabled=no' : null,
            $on('proxy') ? '/ip proxy set enabled=no' : null,
            $on('mac-neighbor') ? '/tool mac-server set allowed-interface-list=none' : null,
            $on('mac-neighbor') ? '/tool mac-server mac-winbox set allowed-interface-list=none' : null,
            $on('mac-neighbor') ? '/ip neighbor discovery-settings set discover-interface-list=none' : null,
            $on('vpn') ? '/interface pptp-server server set enabled=no' : null,
            // RouterOS 7; di RouterOS 6 parameternya server-dns-names=.
            $on('ntp') && $s['ntp'] ? '/system ntp client set enabled=yes servers=' . implode(',', $s['ntp']) : null,
            $on('versi') && $s['kanal'] !== 'ikuti' ? "/system package update set channel={$s['kanal']}" : null,
        ]);
        if ($sistem) {
            array_push($b, '', '# Layanan sampingan dan sistem', ...$sistem);
        }
        if ($on('lisensi')) {
            array_push($b, '', "# CHR: lisensi minimal {$s['lisensi_min']}",
                "# /system license renew account=<akun-mikrotik> password=<password> level={$s['lisensi_min']}");
        }
        $pppoe = array_filter([
            $on('mss') ? '/ppp profile set [find] change-tcp-mss=yes' : null,
            $on('satu-sesi') ? '/interface pppoe-server server set [find] one-session-per-host=yes' : null,
            $on('radius') ? "/ppp aaa set interim-update={$s['interim']}" : null,
        ]);
        if ($pppoe) {
            array_push($b, '', '# Khusus PPPoE server', ...$pppoe);
        }

        return implode("\n", $b);
    }
}
