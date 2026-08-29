import type { ReactNode } from 'react'

/* Halaman panduan pemakaian. Ditulis mengikuti perilaku kode yang sebenarnya —
   kalau ada aturan di sini yang berubah di backend, perbarui halaman ini juga. */

const SECTIONS = [
  ['mulai', 'Mulai dari mana'],
  ['node', 'Menambahkan node'],
  ['ssh', 'Password atau SSH key'],
  ['jadwal', 'Jadwal backup'],
  ['baca', 'Membaca dashboard'],
  ['berkas', 'Mengambil hasil backup'],
  ['terminal', 'Terminal MikroTik'],
  ['konfig', 'Cadangkan daftar node'],
  ['user', 'Pengguna dan hak akses'],
  ['masalah', 'Kalau backup gagal'],
] as const

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6">
      <h2 className="text-lg font-display font-semibold text-[#0F172A] mb-3 pb-2 border-b border-[#E2E8F0]">
        {title}
      </h2>
      <div className="space-y-3 text-sm text-[#334155] leading-relaxed">{children}</div>
    </section>
  )
}

function Note({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'warn' }) {
  const cls =
    tone === 'warn'
      ? 'border-amber-300 bg-amber-50 text-amber-900'
      : 'border-[#BFDBFE] bg-[#EFF6FF] text-[#1E3A8A]'
  return <div className={`rounded-md border px-4 py-3 text-sm ${cls}`}>{children}</div>
}

const K = ({ children }: { children: ReactNode }) => (
  <code className="font-mono text-xs bg-[#F1F5F9] text-[#0F172A] px-1.5 py-0.5 rounded">
    {children}
  </code>
)

export default function PanduanPage() {
  return (
    <div className="max-w-3xl space-y-8 pb-10">
      {/* Kepala artikel */}
      <header className="space-y-3">
        <img src="/perwiramedia.png" alt="PerwiraMedia" className="h-10 w-auto" />
        <h1 className="text-2xl font-display font-bold text-[#0F172A]">
          Panduan PerwiraBackup
        </h1>
        <p className="text-sm text-[#64748B]">
          Sistem ini menyalin konfigurasi router MikroTik dan dump database dari server
          target, lalu menyimpannya di VPS backup sesuai jadwal. Halaman ini menjelaskan
          pemakaian sehari-harinya — cukup dibaca sekali, lalu dipakai sebagai rujukan.
        </p>
      </header>

      {/* Daftar isi */}
      <nav className="card p-4">
        <p className="text-xs font-medium text-[#64748B] uppercase tracking-wider mb-2">Isi</p>
        <ol className="grid sm:grid-cols-2 gap-x-6 gap-y-1 text-sm list-decimal list-inside">
          {SECTIONS.map(([id, title]) => (
            <li key={id}>
              <a href={`#${id}`} className="text-[#0077FF] hover:underline">
                {title}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <Section id="mulai" title="Mulai dari mana">
        <p>
          Saat aplikasi pertama kali dibuka dan belum ada pengguna sama sekali, Anda akan
          diarahkan ke halaman <strong>Setup</strong> untuk membuat akun admin pertama.
          Setelah itu masuk lewat halaman login seperti biasa.
        </p>
        <p>
          Urutan yang masuk akal: buat akun admin → tambahkan satu node → jalankan
          <strong> Backup Now</strong> sekali untuk memastikan koneksinya benar → baru
          serahkan sisanya ke penjadwal.
        </p>
        <Note tone="warn">
          Jangan menjalankan <K>php artisan db:seed</K> di server produksi. Perintah itu
          membuat akun <K>admin</K> dengan password <K>password123</K>.
        </Note>
      </Section>

      <Section id="node" title="Menambahkan node">
        <p>
          Node adalah satu perangkat atau server yang mau di-backup. Tambahkan lewat menu
          <strong> Devices</strong> → <strong>Add Node</strong>. Ada tiga tipe:
        </p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>
            <strong>MikroTik</strong> — menjalankan <K>/export</K> lewat SSH dan menyimpan
            hasilnya sebagai berkas <K>.rsc</K>.
          </li>
          <li>
            <strong>Database</strong> — menjalankan <K>mysqldump</K> lewat SSH di server
            target, lalu dikompres jadi <K>.sql.gz</K> di VPS backup.
          </li>
          <li>
            <strong>Virtualizor DB</strong> — tidak membuat dump baru, melainkan menarik
            berkas backup yang sudah dibuat Virtualizor sendiri lewat SCP. Isi
            <K>db_name</K> hanya kalau path-nya bukan <K>/var/virtualizor/backup/db</K>.
          </li>
        </ul>
        <p>
          <strong>Nama node</strong> dipakai sebagai nama folder penyimpanan, jadi aturannya
          ketat: harus diawali huruf/angka, hanya boleh berisi huruf, angka, spasi, titik,
          garis bawah, dan garis pisah — serta <strong>tidak boleh sama</strong> dengan node
          lain. Dua node bernama sama akan berbagi folder dan saling menghapus berkas.
        </p>
        <Note>
          Mengganti nama node ikut memindahkan folder backup lamanya, jadi riwayatnya tidak
          hilang.
        </Note>
      </Section>

      <Section id="ssh" title="Password atau SSH key">
        <p>
          Tiap node terhubung ke targetnya dengan salah satu dari dua cara. Kalau
          <strong> SSH Key Path</strong> diisi dan berkasnya ada, key yang dipakai dan
          password diabaikan.
        </p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>
            <strong>Password</strong> — paling cepat disiapkan. Butuh <K>sshpass</K>
            terpasang di VPS backup.
          </li>
          <li>
            <strong>SSH key</strong> — lebih disarankan. Isi dengan <em>path absolut</em> ke
            private key di VPS backup, dan pastikan berkasnya bisa dibaca user yang
            menjalankan queue worker (<K>www-data</K>). Yang dipasang di perangkat target
            adalah public key-nya.
          </li>
        </ul>
        <p>
          Untuk MikroTik, user SSH-nya cukup punya policy <K>read</K> agar bisa menjalankan
          <K>/export</K>. Untuk node database, user MySQL-nya cukup diberi
          <K>SELECT, LOCK TABLES, SHOW VIEW, EVENT, TRIGGER</K> pada database yang dituju.
        </p>
        <Note tone="warn">
          <strong>Key MikroTik harus RSA, bukan ed25519.</strong> Impor <em>user public key</em>{' '}
          ed25519 baru didukung sejak RouterOS 7.12 — versi 6.x dan 7.0–7.11 menolaknya dengan{' '}
          <K>unable to load key file (wrong format?)</K>. Skrip{' '}
          <K>deploy/ssh-keys.sh</K> sudah membuatkan key yang tepat per kategori.
        </Note>
        <Note tone="warn">
          Backup MikroTik memakai <K>/export show-sensitive</K> supaya bisa dipakai
          memulihkan layanan — artinya berkas <K>.rsc</K> memuat kredensial pelanggan
          (PPPoE, RADIUS, PSK). Berkasnya ditulis dengan izin <K>0600</K>; perlakukan folder
          backup sebagai aset sensitif.
        </Note>
      </Section>

      <Section id="jadwal" title="Jadwal backup">
        <p>
          Tiap node punya interval: 1, 2, 3, 4, 6, 8, 12, atau 24 jam. Jadwalnya
          <strong> di-align ke tengah malam WIB</strong>, bukan dihitung dari kapan node
          dibuat. Interval 6 jam berarti berjalan pukul 00:00, 06:00, 12:00, dan 18:00 WIB.
        </p>
        <p>
          Node yang baru ditambahkan dijadwalkan pertama kali <strong>besok pukul 00:00
          WIB</strong>, jam berapa pun ia dibuat. Kalau ingin memastikan koneksinya benar
          sekarang juga, pakai tombol <strong>Backup Now</strong> di halaman detail node —
          itu tidak mengubah jadwal rutinnya.
        </p>
        <p>
          Berkas yang lebih tua dari masa retensi (bawaannya 7 hari) dihapus otomatis
          <em> setelah backup berikutnya berhasil</em>. Kalau backup terus gagal, berkas
          lama tidak ikut terhapus.
        </p>
      </Section>

      <Section id="baca" title="Membaca dashboard">
        <p>
          Kolom <strong>Status</strong> dan <strong>Last Run</strong> keduanya bicara tentang{' '}
          <em>percobaan terakhir</em> — bukan sukses terakhir. Jadi kalau statusnya
          <K>failed</K>, tanggal di sebelahnya adalah waktu kegagalan itu, bukan waktu
          backup baik terakhir.
        </p>
        <p>
          Untuk melihat umur backup baik terakhir, buka detail node: saat percobaan terakhir
          gagal, di bawah <strong>Last Run</strong> muncul baris kuning{' '}
          <em>“sukses terakhir: …”</em>. Itu angka yang Anda butuhkan saat memutuskan
          seberapa gawat keadaannya.
        </p>
        <Note>
          Kalau muncul spanduk merah “Gagal memuat daftar node”, artinya dashboard tidak bisa
          menghubungi server. Angka yang tampil saat itu tidak bisa dipercaya — dan daftar
          yang kosong <strong>bukan</strong> berarti node Anda hilang.
        </Note>
      </Section>

      <Section id="berkas" title="Mengambil hasil backup">
        <p>
          Ada dua jalan. Menu <strong>Backup Files</strong> menampilkan seluruh berkas dari
          semua node dengan penyaring tipe, sedangkan tab <strong>Backup Files</strong> di
          halaman detail node hanya menampilkan milik node itu. Keduanya punya tombol unduh
          di tiap baris.
        </p>
        <p>
          Di server, berkasnya tersimpan di{' '}
          <K>storage/app/backups/&lt;tipe&gt;/&lt;nama-node&gt;/</K> dengan nama berstempel
          waktu WIB.
        </p>
      </Section>

      <Section id="terminal" title="Terminal MikroTik">
        <p>
          Di halaman detail node MikroTik, admin bisa membuka <strong>Terminal</strong> untuk
          menjalankan perintah RouterOS langsung. Nama node yang sedang dituju ditampilkan
          mencolok di header terminal — perhatikan itu sebelum menekan Enter.
        </p>
        <p>
          Perintah yang <strong>mengubah keadaan router ditolak</strong>:{' '}
          <K>remove</K>, <K>reset-configuration</K>, <K>disable</K>, <K>shutdown</K>,{' '}
          <K>set</K>, dan <K>upgrade</K>. Terminal ini untuk melihat keadaan, bukan
          mengubah konfigurasi.
        </p>
        <Note tone="warn">
          Ini daftar-tolak, bukan daftar-izin. Sintaks RouterOS yang tak terduga masih bisa
          lolos, jadi jangan jadikan terminal ini satu-satunya pengaman.
        </Note>
      </Section>

      <Section id="konfig" title="Cadangkan daftar node">
        <p>
          Menu <strong>Konfigurasi Node</strong> (admin) mengekspor daftar node ke berkas
          JSON, dan bisa mengimpornya kembali. Berguna untuk pindah VPS, atau menambah
          banyak node sekaligus tanpa mengetik satu per satu di form.
        </p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>
            <strong>Unduh tanpa password</strong> — aman disimpan dan dibagikan. Cocok
            dijadikan templat: sunting berkasnya, tambahkan entri, lalu impor. Password tiap
            node diisi ulang lewat form setelahnya.
          </li>
          <li>
            <strong>Unduh lengkap</strong> — password ikut dalam bentuk terenkripsi. Hanya
            bisa dipulihkan di instalasi dengan <K>APP_KEY</K> yang sama, jadi saat pindah
            VPS salin juga <K>APP_KEY</K> dari <K>.env</K>.
          </li>
        </ul>
        <p>
          Saat mengimpor, tekan <strong>Pratinjau</strong> dulu. Ia menghitung berapa yang
          akan dibuat, diperbarui, dan dilewati tanpa mengubah apa pun. Kalau ada satu entri
          tidak valid, seluruh impor dibatalkan dan tidak ada yang tersentuh.
        </p>
      </Section>

      <Section id="user" title="Pengguna dan hak akses">
        <p>Ada tiga peran, dikelola admin lewat menu <strong>User Management</strong>:</p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>
            <strong>viewer</strong> — melihat node, log, dan metrik; mengunduh berkas backup.
          </li>
          <li>
            <strong>operator</strong> — semua kemampuan viewer, ditambah menambah/mengubah/
            menghapus node dan memicu backup manual.
          </li>
          <li>
            <strong>admin</strong> — semua kemampuan operator, ditambah manajemen pengguna,
            terminal MikroTik, hapus node massal, serta ekspor/impor konfigurasi.
          </li>
        </ul>
        <Note>
          Admin aktif terakhir tidak bisa diturunkan perannya. Kalau bisa, tidak akan ada
          lagi yang mampu mengelola pengguna dan sistem hanya bisa dipulihkan lewat database.
        </Note>
      </Section>

      <Section id="masalah" title="Kalau backup gagal">
        <p>
          Buka detail node dan lihat tab <strong>Backup Logs</strong>. Pesan errornya
          ditampilkan apa adanya dari SSH atau <K>mysqldump</K> — biasanya sudah cukup
          menunjuk penyebabnya. Beberapa yang sering muncul:
        </p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>
            <K>exit code 127 … sshpass</K> — <K>sshpass</K> belum terpasang di VPS backup.
            Pasang, atau pindah ke autentikasi SSH key.
          </li>
          <li>
            <K>Permission denied</K> — user SSH atau public key-nya belum benar di perangkat
            target. Uji manual dari VPS backup sebagai user <K>www-data</K>.
          </li>
          <li>
            <K>Output /export kosong</K> — user MikroTik-nya belum punya policy <K>read</K>.
          </li>
          <li>
            <K>Dump tidak lengkap</K> — koneksi terputus di tengah <K>mysqldump</K>. Backup
            sengaja ditolak alih-alih menyimpan dump separuh yang tidak bisa dipulihkan.
          </li>
          <li>
            <K>Backup terbaru … sudah basi</K> — khusus Virtualizor: sumbernya berhenti
            membuat dump baru. Periksa cron backup di node Virtualizor-nya.
          </li>
        </ul>
        <p>
          Kalau notifikasi Telegram sudah diatur, kegagalan juga dikirim ke sana dengan jeda
          antar-peringatan agar tidak membanjiri grup, dan ada pemberitahuan pemulihan saat
          node yang tadinya gagal kembali berhasil.
        </p>
      </Section>
    </div>
  )
}
