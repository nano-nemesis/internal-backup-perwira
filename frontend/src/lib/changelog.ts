// Catatan rilis: tampil sekali per versi sebagai pop-up "Yang baru" dan bisa dibuka lagi dari sidebar.
// Saat rilis: naikkan "version" di frontend/package.json (mayor.minor.patch) lalu tambahkan entri di PALING ATAS.
//   patch (1.0.1) = perbaikan · minor (1.1.0) = fitur baru · mayor (2.0.0) = perubahan besar.
export type Rilis = { versi: string; tanggal: string; judul: string; poin: string[] }

export const CHANGELOG: Rilis[] = [
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
