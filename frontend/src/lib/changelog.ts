// Catatan rilis: tampil sekali per versi sebagai pop-up "Yang baru" dan bisa dibuka lagi dari sidebar.
// Saat rilis: naikkan "version" di frontend/package.json (mayor.minor.patch) lalu tambahkan entri di PALING ATAS.
//   patch (1.0.1) = perbaikan · minor (1.1.0) = fitur baru · mayor (2.0.0) = perubahan besar.
export type Rilis = { versi: string; tanggal: string; judul: string; poin: string[] }

export const CHANGELOG: Rilis[] = [
  {
    versi: '1.6.0',
    tanggal: '2026-10-20',
    judul: 'Doctor: standar router MikroTik Perwira',
    poin: [
      'Menu baru Doctor: memeriksa setiap MikroTik terhadap standar keamanan, lisensi CHR, PPPoE, VPN/IP publik, dan sistem — lengkap dengan perintah perbaikannya.',
      'Peran router dideteksi otomatis (CHR, IP Publik, Server VPN, PPPoE Server); laporan diperbarui setiap backup, atau lewat Periksa sekarang / Periksa semua.',
      'Ringkasan doctor tampil di Dashboard, dan tiap node punya tab Doctor.',
      'Doctor hanya membaca konfigurasi; router tidak diubah.',
    ],
  },
  {
    versi: '1.5.0',
    tanggal: '2026-10-20',
    judul: 'Versi RouterOS & simulasi pemulihan',
    poin: [
      'Versi RouterOS dan model tiap MikroTik dibaca langsung dari router: saat halaman node dibuka, setiap backup berhasil, dan lewat tombol "Cek sekarang". Tampil juga di daftar Devices.',
      'Backup Logs mencatat versi RouterOS saat tiap backup dibuat.',
      'Tab baru "Simulasi & Pemulihan": simulasi restore menilai keutuhan berkas, kecocokan model dan versi, lalu menampilkan langkah restore.',
      'Simulasi gangguan: picu backup gagal ke target palsu untuk membuktikan Telegram, Log Sistem, dan status dashboard bereaksi.',
    ],
  },
  {
    versi: '1.4.0',
    tanggal: '2026-10-20',
    judul: 'Pilih tipe backup MikroTik: .rsc atau .backup',
    poin: [
      'Tiap node MikroTik kini memilih satu tipe backup di form node: .rsc (export teks) atau .backup (biner). Centang "Juga simpan backup biner" diganti pilihan ini.',
      'Backup .backup tampil di Backup Logs seperti .rsc: nama berkas, ukuran, durasi, berhasil atau gagal.',
      '.backup yang gagal kini dihitung backup gagal dan dikirim ke Telegram, bukan lagi sekadar peringatan.',
    ],
  },
  {
    versi: '1.3.1',
    tanggal: '2026-10-20',
    judul: 'Perbaikan backup biner',
    poin: [
      'Penolakan router saat /system backup save kini terdeteksi. Sebelumnya RouterOS tetap melapor sukses dan Log Sistem menampilkan error scp yang menyesatkan.',
      'Koreksi syarat policy: backup biner butuh write + policy + ftp (terbukti di RouterOS 7.23), bukan write + ftp saja.',
    ],
  },
  {
    versi: '1.3.0',
    tanggal: '2026-10-20',
    judul: 'Backup biner MikroTik (.backup)',
    poin: [
      'Node MikroTik bisa ikut menyimpan backup biner .backup di samping .rsc — centang "Juga simpan backup biner" di form node.',
      'Berkas .backup muncul di Backup Files dan detail node, bisa diunduh, dan ikut dihapus retensi seperti .rsc.',
      'Berkas sementara di flash router langsung dihapus setelah ditarik.',
      'Butuh policy write + ftp di user router. Kalau belum ada, .rsc tetap tersimpan dan sebabnya tercatat di Log Sistem.',
    ],
  },
  {
    versi: '1.2.0',
    tanggal: '2026-09-26',
    judul: 'Log Sistem',
    poin: [
      'Halaman baru "Log Sistem" (menu Admin): semua kejadian tercatat dengan keterangan yang jelas.',
      'Tercatat: login berhasil/gagal/diblokir, logout, backup mulai/berhasil/gagal (beserta kemungkinan sebabnya), perubahan node & user, perintah terminal, unduhan berkas backup, pengaturan Telegram, dan error server.',
      'Klik satu baris untuk melihat detail teknis: error mentah, kolom yang diubah (dari → ke), durasi, ukuran berkas, dll.',
      'Filter per tingkat (error/peringatan/info), kategori, node, tanggal, dan pencarian bebas; ringkasan 24 jam di atas.',
      'Backup MikroTik RouterOS 6 kembali berjalan, dan otomatis mencoba password bila SSH key ditolak.',
    ],
  },
  {
    versi: '1.1.0',
    tanggal: '2026-09-24',
    judul: 'Bisa dipasang ke layar utama',
    poin: [
      'Internal Backup bisa dipasang ke layar utama HP dan dibuka seperti aplikasi, tanpa bilah alamat.',
      'Tombol "Pasang ke layar utama" di menu samping; di iPhone ada petunjuk lewat tombol Bagikan.',
      'Aplikasi memperbarui dirinya sendiri begitu versi baru terpasang di server.',
      'Login tetap tersimpan setelah aplikasi ditutup, dan diperpanjang tiap kali aplikasi dibuka.',
      'Tampilan menyesuaikan notch dan bilah gestur HP.',
      'Pop-up "Yang baru" ini dan nomor versi di bagian bawah menu samping.',
    ],
  },
]

export const rilis = (versi: string) => CHANGELOG.find((r) => r.versi === versi)
