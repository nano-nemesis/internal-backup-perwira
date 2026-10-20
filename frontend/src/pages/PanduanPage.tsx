import { createContext, useContext, useEffect, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { AlertTriangle, ChevronLeft, ChevronRight, Info } from 'lucide-react'
import { cn } from '../lib/utils'

/* Halaman panduan pemakaian. Ditulis mengikuti perilaku kode yang sebenarnya;
   kalau ada aturan di sini yang berubah di backend atau di layar, perbarui halaman ini juga. */

const SECTIONS = [
  ['mulai', 'Mulai dari mana'],
  ['node', 'Menambahkan node'],
  ['ssh', 'Password atau SSH key'],
  ['jadwal', 'Jadwal backup'],
  ['baca', 'Membaca dashboard dan perangkat'],
  ['berkas', 'Mengambil hasil backup'],
  ['doctor', 'Doctor: standar router'],
  ['simulasi', 'Simulasi dan pemulihan'],
  ['terminal', 'Terminal MikroTik'],
  ['konfig', 'Cadangkan daftar node'],
  ['user', 'Pengguna dan hak akses'],
  ['telegram', 'Cek lewat Telegram'],
  ['pasang', 'Pasang di HP'],
  ['masalah', 'Kalau backup gagal'],
] as const

type Id = (typeof SECTIONS)[number][0]

// Satu bagian tampil sekali waktu (seperti mockup); bagian lain tidak dirender.
const Aktif = createContext<Id>('mulai')

function Section({ id, title, children }: { id: Id; title: string; children: ReactNode }) {
  if (useContext(Aktif) !== id) return null
  return (
    <section aria-labelledby={`judul-${id}`} className="flex flex-col gap-4 animate-masuk">
      <h2 id={`judul-${id}`} className="text-2xl font-extrabold text-[#0F172A]">{title}</h2>
      {children}
    </section>
  )
}

const H3 = ({ children }: { children: ReactNode }) => (
  <h3 className="mt-2 text-lg font-bold text-[#0F172A]">{children}</h3>
)

const Daftar = ({ children }: { children: ReactNode }) => (
  <ul className="list-disc pl-[22px] flex flex-col gap-1.5">{children}</ul>
)

function Note({ children, judul, tone = 'info' }: { children: ReactNode; judul?: string; tone?: 'info' | 'warn' }) {
  const Ikon = tone === 'warn' ? AlertTriangle : Info
  return (
    <div className={cn('flex gap-3.5 rounded-2xl px-[18px] py-4 text-sm', tone === 'warn' ? 'bg-[#FFFBEB] text-[#78350F]' : 'bg-[#EEF0FE] text-[#1E2A78]')}>
      <Ikon className="w-5 h-5 flex-shrink-0 mt-0.5" strokeWidth={1.8} />
      <div>
        {judul && <p className="font-bold text-[15px]">{judul}</p>}
        <div className={cn(judul && 'mt-1')}>{children}</div>
      </div>
    </div>
  )
}

const K = ({ children }: { children: ReactNode }) => (
  <code className="font-mono text-[13px] bg-[#F1F2F7] text-[#0F172A] px-1.5 py-0.5 rounded-md">{children}</code>
)

const Kode = ({ children }: { children: string }) => (
  <pre className="m-0 bg-[#0F172A] text-[#E2E8F0] rounded-[14px] px-[18px] py-4 font-mono text-[13px] leading-[1.7] overflow-x-auto whitespace-pre">
    {children}
  </pre>
)

export default function PanduanPage() {
  const { hash } = useLocation()
  const navigate = useNavigate()
  const aktif: Id = SECTIONS.find(([id]) => `#${id}` === hash)?.[0] ?? 'mulai'
  const i = SECTIONS.findIndex(([id]) => id === aktif)
  const [sebelum, sesudah] = [SECTIONS[i - 1], SECTIONS[i + 1]]

  // Ganti bagian = mulai baca dari atas, bukan dari posisi gulir bagian sebelumnya.
  useEffect(() => {
    document.querySelector('main')?.scrollTo({ top: 0 })
  }, [aktif])

  return (
    <div className="space-y-5 max-w-screen-2xl">
      <header>
        <h1 className="text-[28px] leading-tight font-extrabold text-[#0F172A]">Panduan</h1>
        <p className="text-sm text-[#475569] mt-1">Ditulis mengikuti perilaku sistem yang sebenarnya</p>
      </header>

      <div className="flex flex-wrap gap-5 items-start">
        <nav aria-label="Isi panduan" className="hidden lg:flex card flex-[1_1_220px] p-[18px] flex-col gap-0.5 sticky top-0">
          <span className="text-[11px] font-bold tracking-[0.08em] text-[#475569] px-2.5 pb-2">ISI</span>
          {SECTIONS.map(([id, title]) => (
            <Link
              key={id}
              to={{ hash: id }}
              aria-current={aktif === id ? 'true' : undefined}
              className={cn(
                'px-2.5 py-2.5 rounded-[10px] text-sm transition-colors',
                aktif === id ? 'font-bold text-[#2E3AC2] bg-[#EEF0FE]' : 'text-[#334155] hover:bg-[#F1F2F7]',
              )}
            >
              {title}
            </Link>
          ))}
        </nav>

        <article className="card flex-[3_1_520px] min-w-0 px-5 py-6 md:p-8 flex flex-col gap-4 text-[15px] leading-[1.7] text-[#334155]">
          {/* HP & tablet: daftar isi jadi pilihan di atas artikel. */}
          <label className="lg:hidden flex flex-col gap-1.5 text-[11px] font-bold tracking-[0.08em] text-[#475569]">
            ISI
            <select
              value={aktif}
              onChange={(e) => navigate({ hash: e.target.value })}
              className="pilih h-11 text-sm tracking-normal"
            >
              {SECTIONS.map(([id, title], n) => <option key={id} value={id}>{n + 1}. {title}</option>)}
            </select>
          </label>

          <Aktif.Provider value={aktif}>
            <Section id="mulai" title="Mulai dari mana">
              <p>
                Sistem ini menyalin konfigurasi router MikroTik dan dump database dari server target, lalu
                menyimpannya di VPS backup sesuai jadwal. Panduan ini menjelaskan pemakaian sehari-harinya:
                cukup dibaca sekali, lalu dipakai sebagai rujukan.
              </p>
              <p>
                Saat aplikasi pertama kali dibuka dan belum ada pengguna sama sekali, Anda diarahkan ke halaman{' '}
                <strong>Setup</strong> untuk membuat akun admin pertama. Setelah itu masuk lewat halaman login seperti biasa.
              </p>
              <p>
                Urutan yang masuk akal: buat akun admin, tambahkan satu node, jalankan{' '}
                <strong>Backup sekarang</strong> sekali untuk memastikan koneksinya benar, baru serahkan sisanya ke penjadwal.
              </p>
              <Note tone="warn" judul="Jangan jalankan db:seed di server produksi">
                Perintah <K>php artisan db:seed</K> membuat akun <K>admin</K> dengan password <K>password123</K>.
              </Note>
            </Section>

            <Section id="node" title="Menambahkan node">
              <p>
                Node adalah satu perangkat atau server yang mau di-backup. Tambahkan lewat menu{' '}
                <strong>Perangkat</strong>, tombol <strong>Tambah node</strong>. Ada tiga tipe:
              </p>
              <Daftar>
                <li>
                  <strong>MikroTik</strong>: menjalankan <K>/export</K> lewat SSH dan menyimpan hasilnya sebagai
                  berkas <K>.rsc</K>, atau <K>.backup</K> biner kalau tipe backup node itu diganti.
                </li>
                <li>
                  <strong>Database</strong>: menjalankan <K>mysqldump</K> lewat SSH di server target, lalu dikompres
                  jadi <K>.sql.gz</K> di VPS backup.
                </li>
                <li>
                  <strong>Virtualizor DB</strong>: tidak membuat dump baru, melainkan menarik berkas backup yang sudah
                  dibuat Virtualizor sendiri lewat SCP. Isi <K>db_name</K> hanya kalau path-nya bukan{' '}
                  <K>/var/virtualizor/backup/db</K>.
                </li>
              </Daftar>
              <p>
                <strong>Nama node</strong> dipakai sebagai nama folder penyimpanan, jadi aturannya ketat: harus
                diawali huruf atau angka, hanya boleh berisi huruf, angka, spasi, titik, garis bawah, dan garis pisah,
                serta <strong>tidak boleh sama</strong> dengan node lain. Dua node bernama sama akan berbagi folder dan
                saling menghapus berkas.
              </p>
              <Note>Mengganti nama node ikut memindahkan folder backup lamanya, jadi riwayatnya tidak hilang.</Note>
            </Section>

            <Section id="ssh" title="Password atau SSH key">
              <p>
                Tiap node terhubung ke targetnya dengan salah satu dari dua cara. Kalau <strong>SSH Key Path</strong>{' '}
                diisi dan berkasnya ada, key yang dipakai dan password diabaikan.
              </p>
              <Daftar>
                <li><strong>Password</strong>: paling cepat disiapkan. Butuh <K>sshpass</K> terpasang di VPS backup.</li>
                <li>
                  <strong>SSH key</strong>: lebih disarankan. Isi dengan <em>path absolut</em> ke private key di VPS
                  backup, dan pastikan berkasnya bisa dibaca user yang menjalankan queue worker (<K>www-data</K>).
                  Yang dipasang di perangkat target adalah public key-nya.
                </li>
              </Daftar>
              <H3>Izin minimum di sisi target</H3>
              <Daftar>
                <li>
                  <strong>MikroTik</strong>: user RouterOS dengan grup <K>read</K>. Grup bawaan itu sudah memuat policy{' '}
                  <K>ssh</K>, <K>read</K>, dan <K>sensitive</K>. Policy <K>sensitive</K> wajib: tanpanya{' '}
                  <K>/export show-sensitive</K> tetap jalan tapi nilai rahasianya keluar sebagai <K>***</K>. Tidak perlu{' '}
                  <K>write</K> maupun <K>policy</K>, kecuali node itu memilih tipe backup <strong>.backup</strong> (biner):{' '}
                  <K>/system backup save</K> butuh <K>write</K> + <K>policy</K>, dan menarik berkasnya lewat scp butuh{' '}
                  <K>ftp</K>. Buat grup sendiri, mis.{' '}
                  <K>/user group add name=backup-biner policy=ssh,ftp,read,write,policy,sensitive</K>. Ingat tukarannya:{' '}
                  <K>policy</K> bisa membuat user baru, jadi kunci backup praktis setara admin penuh router itu.
                </li>
                <li>
                  <strong>Server database</strong>: user SSH biasa (tanpa sudo, tanpa root) yang bisa menjalankan{' '}
                  <K>mysqldump</K>, ditambah user MySQL dengan <K>GRANT SELECT, SHOW VIEW, TRIGGER ON dbname.*</K>.
                  Ketiganya wajib; lihat catatan di bawah.
                </li>
                <li>
                  <strong>Virtualizor</strong>: user SSH yang bisa membaca direktori backup Virtualizor (bawaannya{' '}
                  <K>/var/virtualizor/backup/db</K>). Tidak harus root: akses baca lewat ACL sudah cukup, karena sistem
                  hanya menyalin berkas yang ada.
                </li>
              </Daftar>
              <Note tone="warn" judul="Grant database jangan dikurangi">
                Tanpa <K>SHOW VIEW</K>, dump gagal kalau ada view. Tanpa <K>TRIGGER</K>, dump justru <em>selesai dan
                lolos pemeriksaan</em>, tapi trigger hilang tanpa satu pun pesan error. Backup terlihat utuh padahal
                tidak. <K>LOCK TABLES</K>, <K>EVENT</K>, dan <K>PROCESS</K> tidak diperlukan.
              </Note>
              <Note tone="warn" judul="Key MikroTik harus RSA, bukan ed25519">
                Impor <em>user public key</em> ed25519 baru didukung sejak RouterOS 7.12. Versi 6.x dan 7.0 sampai 7.11
                menolaknya dengan <K>unable to load key file (wrong format?)</K>. Skrip <K>deploy/ssh-keys.sh</K> sudah
                membuatkan key yang tepat per kategori.
              </Note>
              <Note tone="warn" judul="Berkas .rsc memuat kredensial pelanggan">
                Backup MikroTik memakai <K>/export show-sensitive</K> supaya bisa dipakai memulihkan layanan, jadi
                berkasnya memuat PPPoE, RADIUS, dan PSK. Berkasnya ditulis dengan izin <K>0600</K>; perlakukan folder
                backup sebagai aset sensitif.
              </Note>
            </Section>

            <Section id="jadwal" title="Jadwal backup">
              <p>
                Tiap node punya interval: 1, 2, 3, 4, 6, 8, 12, atau 24 jam. Jadwalnya{' '}
                <strong>di-align ke tengah malam WIB</strong>, bukan dihitung dari kapan node dibuat. Interval 6 jam
                berarti berjalan pukul 00:00, 06:00, 12:00, dan 18:00 WIB.
              </p>
              <p>
                Node yang baru ditambahkan dijadwalkan pertama kali <strong>besok pukul 00:00 WIB</strong>, jam berapa
                pun ia dibuat. Kalau ingin memastikan koneksinya benar sekarang juga, pakai tombol{' '}
                <strong>Backup sekarang</strong> di halaman detail node; itu tidak mengubah jadwal rutinnya.
              </p>
              <p>
                Setelah tombol itu ditekan, prosesnya tampil langsung tahap demi tahap (antre, mengambil konfigurasi,
                menyalin, memeriksa berkas, membaca versi dan Doctor) beserta lama berjalannya. Di halaman lain, panel
                kecil di pojok kanan atas mengikuti sampai backup selesai. Tidak perlu memuat ulang halaman.
              </p>
              <p>
                Berkas yang lebih tua dari masa retensi (bawaannya 7 hari) dihapus otomatis{' '}
                <em>setelah backup berikutnya berhasil</em>. Kalau backup terus gagal, berkas lama tidak ikut terhapus.
              </p>
            </Section>

            <Section id="baca" title="Membaca dashboard dan perangkat">
              <p>
                Status backup di Dashboard dan di menu <strong>Perangkat</strong> selalu bicara tentang{' '}
                <em>percobaan terakhir</em>, bukan sukses terakhir. Di tabel Perangkat, kolom <strong>Backup</strong>{' '}
                berisi <strong>Sehat</strong>, <strong>Gagal</strong>, atau <strong>Basi</strong>; kalau gagal, baris
                kecil di bawahnya menunjukkan kapan terakhir sukses. <strong>Basi</strong> berarti backup berhasil
                terakhir lebih tua dari dua kali jadwalnya, tanda penjadwal macet. Kolom <strong>Konfigurasi</strong>{' '}
                adalah ringkasan Doctor untuk MikroTik, dan <strong>Pulih</strong> menilai apakah backup berhasil
                terakhir bisa dipulihkan ke perangkat yang terpasang sekarang (berkas utuh, model dan versi cocok).
              </p>
              <p>
                Aksi yang jarang dipakai (nonaktifkan, hapus node) ada di tombol <strong>⋯</strong> di ujung baris.
              </p>
              <p>
                Pakai kotak cari (nama atau IP), saringan <strong>Bermasalah</strong> (backup gagal atau basi, router
                tak terjangkau, temuan kritis, atau backup yang tidak bisa dipulihkan), dan urutan <strong>Paling mendesak</strong> untuk menemukan router
                yang perlu ditangani lebih dulu. Pilihan ini ikut tersimpan di alamat halaman, jadi tetap sama saat Anda
                kembali dari detail node.
              </p>
              <p>
                Di detail node, kartu <strong>Backup</strong> menampilkan baris <em>Sukses terakhir</em> saat
                percobaan terakhir gagal. Itu angka yang Anda butuhkan saat memutuskan seberapa gawat keadaannya.
              </p>
              <Note>
                Kalau muncul spanduk merah "Gagal memuat daftar node", dashboard tidak bisa menghubungi server. Angka
                yang tampil saat itu tidak bisa dipercaya, dan daftar yang kosong <strong>bukan</strong> berarti node Anda
                hilang.
              </Note>
            </Section>

            <Section id="berkas" title="Mengambil hasil backup">
              <p>
                Ada dua jalan. Menu <strong>Berkas Backup</strong> menampilkan seluruh berkas dari semua node, sedangkan
                tab <strong>Berkas</strong> di halaman detail node hanya menampilkan milik node itu.
              </p>
              <p>
                Di menu Berkas Backup, cari dengan nama berkas atau nama node, saring per jenis (<K>.rsc</K>,{' '}
                <K>.backup</K>, <K>.sql.gz</K>) atau per node, dan urutkan dari yang terbaru, terlama, nama node, atau
                ukuran terbesar. Berkas MikroTik punya tautan <strong>Simulasi restore</strong> yang langsung membuka
                simulasi untuk berkas itu.
              </p>
              <p>
                Tombol <strong>Unduh</strong> hanya ada untuk operator dan admin. Di server, berkasnya tersimpan di{' '}
                <K>storage/app/backups/&lt;tipe&gt;/&lt;nama-node&gt;/</K> dengan nama berstempel waktu WIB.
              </p>
            </Section>

            <Section id="doctor" title="Doctor: standar router Perwira">
              <p>
                Menu <strong>Doctor</strong> membandingkan konfigurasi setiap MikroTik dengan standar di bawah. Datanya
                diambil dengan perintah baca saja, satu sesi SSH, setiap backup berhasil, lewat tombol{' '}
                <strong>Periksa sekarang</strong> di tab Doctor node, atau <strong>Periksa semua</strong>. Doctor tidak
                mengubah router; setiap temuan disertai perintah perbaikan untuk dijalankan manual.
              </p>
              <div className="flex gap-2 flex-wrap items-center">
                {['CHR', 'IP Publik', 'Server VPN', 'PPPoE Server'].map((p) => (
                  <span key={p} className="px-2.5 py-0.5 rounded-full border border-[#DADDE8] text-xs font-semibold text-[#334155]">{p}</span>
                ))}
                <span className="text-[13px] text-[#475569]">peran dideteksi otomatis</span>
              </div>
              <H3>Keamanan</H3>
              <Daftar>
                <li>Telnet, FTP, dan www (HTTP) mati, karena ketiganya mengirim password tanpa enkripsi.</li>
                <li>Winbox, SSH, dan API dibatasi <K>address</K> ke alamat NOC.</li>
                <li>
                  Router ber-IP publik wajib punya <strong>drop menyeluruh</strong> di chain input, setelah accept untuk
                  koneksi balik, NOC, ICMP, dan port VPN yang memang dilayani.
                </li>
                <li>Kalau DNS melayani permintaan luar, port 53 dari internet harus tertutup (bukan open resolver).</li>
                <li>Bandwidth-test server, SOCKS, dan web proxy mati (atau btest berautentikasi).</li>
                <li>SNMP community bukan <K>public</K> dan dibatasi alamat.</li>
                <li>MAC server dan neighbor discovery tidak aktif di semua interface pada router ber-IP publik.</li>
                <li>Tidak memakai PPTP; L2TP sebaiknya dengan IPsec.</li>
              </Daftar>
              <Note tone="warn" judul="Jalankan perbaikan firewall dalam Safe Mode">
                Tekan Ctrl+X di terminal atau Winbox sebelum menempel perintah. Kalau koneksi Anda terputus, semua
                perubahan dibatalkan otomatis. Perintah lengkapnya disusun per router dari layanan VPN yang aktif, dan
                ada di tab Doctor node itu. Bentuknya kira-kira:
              </Note>
              <Kode>{`/ip firewall filter
add chain=input connection-state=established,related action=accept
add chain=input src-address-list=NOC action=accept
add chain=input in-interface=ether1-uplink action=drop`}</Kode>
              <H3>Sistem, CHR, dan PPPoE</H3>
              <Daftar>
                <li>RouterOS versi terbaru di kanalnya (dicek ke server MikroTik); RouterOS 6 direncanakan migrasi ke v7.</li>
                <li>NTP client aktif, CPU di bawah 80%, RAM dan disk bebas di atas 10%, ada rute default.</li>
                <li>FastTrack tidak aktif bersama queue atau limit pelanggan, karena paket fasttrack melewati queue.</li>
                <li>CHR memakai lisensi P1 ke atas. Lisensi free membatasi upload 1 Mbps per interface.</li>
                <li>
                  Profil PPP memakai <K>change-tcp-mss</K> (tanpanya situs tertentu menggantung) dan server PPPoE{' '}
                  <K>one-session-per-host=yes</K>.
                </li>
                <li>Kalau <K>use-radius=yes</K>: server RADIUS ada, dan <K>interim-update</K> diisi (mis. 5m).</li>
              </Daftar>
              <H3>Mengatur standarnya</H3>
              <p>
                Tab <strong>Standar</strong> di menu Doctor berisi aturan yang dipakai untuk menilai: alamat NOC, layanan
                yang wajib mati atau wajib dibatasi alamat NOC, lisensi CHR minimal, kanal RouterOS, server NTP, batas
                CPU/RAM/disk, dan interim update RADIUS. Setiap pemeriksaan bisa dimatikan atau dipaksa tingkatnya
                (kritis, perhatian, info). Hanya admin yang bisa mengubahnya; standar baru berlaku pada pemeriksaan
                berikutnya, dan tombol <strong>Periksa semua sekarang</strong> muncul setelah disimpan.
              </p>
              <p>
                Di tab yang sama ada <strong>Skrip dasar router baru</strong>: konfigurasi awal yang sudah memenuhi
                standar, siap disalin saat memasang CHR atau router baru.
              </p>
              <p>
                Kalau notifikasi <strong>Doctor menemukan kritis baru</strong> di menu Bot Telegram aktif, temuan yang
                baru menjadi kritis sejak pemeriksaan sebelumnya dikirim ke grup. Router yang baru pertama kali diperiksa
                tidak memicu notifikasi.
              </p>
            </Section>

            <Section id="simulasi" title="Simulasi dan pemulihan">
              <p>
                Halaman detail node MikroTik menampilkan <strong>versi RouterOS dan model</strong> yang dibaca langsung
                dari router: otomatis saat halaman dibuka (kalau bacaan terakhir lebih dari 5 menit lalu), setiap backup
                berhasil, dan lewat tombol <strong>Cek sekarang</strong>. Tiap baris di tab <strong>Riwayat</strong> juga
                mencatat versi saat backup itu dibuat.
              </p>
              <p>Tab <strong>Simulasi &amp; Pemulihan</strong> berisi dua alat:</p>
              <Daftar>
                <li>
                  <strong>Simulasi restore</strong>: pilih berkas, lalu sistem menilai keutuhannya (untuk <K>.backup</K>:
                  header dan panjang berkas), kecocokan model, dan versi RouterOS dengan perangkat sekarang, lengkap
                  dengan langkah restore. Router tidak disentuh. <K>.backup</K> hanya untuk model yang sama dan versi yang
                  sama atau lebih baru; <K>.rsc</K> bisa ke perangkat lain dengan penyesuaian nama interface.
                </li>
                <li>
                  <strong>Simulasi gangguan</strong> (operator ke atas): backup dikirim ke target palsu sehingga gagal
                  sungguhan. Hasilnya tercatat di tab Riwayat dan Log Sistem bertanda <K>[SIMULASI]</K>, Telegram mengirim
                  notifikasi (kalau notifikasi gagal aktif), dan status node merah sampai backup berikutnya berhasil.
                  Gunanya membuktikan alarm benar-benar berbunyi saat dibutuhkan.
                </li>
              </Daftar>
              <p>
                Di bawah tombol simulasi gangguan tampil <strong>jejak simulasi terakhir</strong>: kapan backup gagal,
                apakah Telegram benar terkirim (atau dimatikan, ditahan jeda), apakah tercatat di Log Sistem, dan kapan
                node pulih. Semuanya dibaca dari catatan yang sebenarnya, bukan perkiraan.
              </p>
            </Section>

            <Section id="terminal" title="Terminal MikroTik">
              <p>
                Di halaman detail node MikroTik, admin bisa membuka <strong>Terminal</strong> untuk menjalankan perintah
                RouterOS langsung. Nama node yang sedang dituju ditampilkan mencolok di kepala terminal; perhatikan itu
                sebelum menekan Enter.
              </p>
              <p>
                Perintah yang <strong>mengubah keadaan router ditolak</strong>: <K>remove</K>,{' '}
                <K>reset-configuration</K>, <K>disable</K>, <K>shutdown</K>, <K>set</K>, dan <K>upgrade</K>. Terminal ini
                untuk melihat keadaan, bukan mengubah konfigurasi.
              </p>
              <Note tone="warn" judul="Ini daftar-tolak, bukan daftar-izin">
                Sintaks RouterOS yang tak terduga masih bisa lolos, jadi jangan jadikan terminal ini satu-satunya pengaman.
              </Note>
            </Section>

            <Section id="konfig" title="Cadangkan daftar node">
              <p>
                Menu <strong>Konfigurasi Node</strong> (admin) mengekspor daftar node ke berkas JSON, dan bisa
                mengimpornya kembali. Berguna untuk pindah VPS, atau menambah banyak node sekaligus tanpa mengetik satu
                per satu di form.
              </p>
              <Daftar>
                <li>
                  <strong>Tanpa password</strong>: aman disimpan dan dibagikan. Cocok dijadikan templat: sunting
                  berkasnya, tambahkan entri, lalu impor. Password tiap node diisi ulang lewat form setelahnya.
                </li>
                <li>
                  <strong>Lengkap</strong>: password ikut dalam bentuk terenkripsi. Hanya bisa dipulihkan di instalasi
                  dengan <K>APP_KEY</K> yang sama, jadi saat pindah VPS salin juga <K>APP_KEY</K> dari <K>.env</K>.
                </li>
              </Daftar>
              <p>
                Saat mengimpor, pilih atau seret berkasnya. Pratinjau langsung muncul: berapa yang akan dibuat,
                diperbarui, dilewati, dan tidak valid, plus tabel per entri. Belum ada yang berubah sampai Anda menekan{' '}
                <strong>Terapkan</strong>. Kalau ada satu entri tidak valid, tombolnya terkunci dan tidak ada yang
                tersentuh.
              </p>
              <Note tone="warn" judul="Hapus semua node ada di sini">
                Tombolnya di bagian <strong>Zona berbahaya</strong> halaman ini, dan meminta Anda mengetik{' '}
                <K>HAPUS SEMUA</K>. Jadwal, log backup, dan kredensial ikut terhapus; berkas backup di disk tidak.
                Ekspor dulu sebelum melakukannya.
              </Note>
            </Section>

            <Section id="user" title="Pengguna dan hak akses">
              <p>Ada tiga peran, dikelola admin lewat menu <strong>Pengguna</strong>:</p>
              <Daftar>
                <li><strong>Viewer</strong>: melihat status, log backup, dan Doctor. Tidak bisa mengunduh isi berkas.</li>
                <li>
                  <strong>Operator</strong>: semua kemampuan viewer, ditambah menambah node, memicu backup manual,
                  mengunduh berkas, Periksa semua di Doctor, dan simulasi gangguan.
                </li>
                <li>
                  <strong>Admin</strong>: semua kemampuan operator, ditambah mengubah, menonaktifkan, dan menghapus node,
                  pengguna, terminal MikroTik, Konfigurasi Node (ekspor, impor, hapus semua), Bot Telegram, dan Log Sistem.
                </li>
              </Daftar>
              <p>
                Akun yang tidak dipakai lagi <strong>dinonaktifkan</strong> dulu; sesinya langsung terputus. Tombol hapus
                baru muncul untuk akun yang sudah nonaktif. Akun sendiri tidak bisa diubah peran atau statusnya, tetapi
                password-nya tetap bisa direset. Password minimal 12 karakter, berisi huruf dan angka.
              </p>
              <p>
                Login yang gagal memberi tahu sisa percobaan. Setelah 5 kali gagal, login dari alamat IP yang sama dikunci
                5 menit.
              </p>
              <Note>
                Admin aktif terakhir tidak bisa diturunkan perannya maupun dinonaktifkan. Kalau bisa, tidak ada lagi yang
                mampu mengelola pengguna, dan sistem hanya bisa dipulihkan lewat database.
              </Note>
            </Section>

            <Section id="telegram" title="Cek lewat Telegram">
              <p>
                Kalau bot Telegram sudah diatur, keadaan sistem bisa ditanyakan langsung dari HP tanpa membuka dashboard.
                Berguna saat sedang di POP.
              </p>
              <Daftar>
                <li><K>/status</K>: ringkasan armada plus kapasitas VPS dalam satu pesan.</li>
                <li><K>/gagal</K>: node yang gagal, waktu gagalnya, umur backup baik terakhir, dan pesan errornya.</li>
                <li><K>/vps</K>: CPU, RAM, disk (partisi backup), dan load average.</li>
                <li><K>/node &lt;nama&gt;</K>: detail satu node termasuk jadwal berikutnya.</li>
                <li><K>/help</K>: daftar perintah.</li>
              </Daftar>
              <p>
                Token bot dan Chat ID diisi lewat menu <strong>Bot Telegram</strong> (admin). Di sana juga ada pilihan
                notifikasi (backup gagal, node pulih, Doctor kritis baru, setiap backup berhasil), jeda notifikasi gagal
                per node, dan tombol <strong>Kirim pesan uji</strong>. Tokennya disimpan terenkripsi dan tidak pernah
                ditampilkan kembali, hanya petunjuk bertopeng.
              </p>
              <p>
                Lencana di kanan atas menu itu menunjukkan apakah service <K>backup-telegram</K> yang menjawab perintah
                sedang berjalan. Notifikasi tetap terkirim walau service itu mati; yang berhenti hanya jawaban perintah.
              </p>
              <Note>
                Bot hanya <strong>membaca</strong>: tidak ada perintah yang memicu backup atau mengubah konfigurasi. Ia
                juga hanya menjawab di chat yang diatur di menu Bot Telegram; pesan dari chat lain diabaikan tanpa balasan.
              </Note>
            </Section>

            <Section id="pasang" title="Pasang di HP">
              <p>
                Aplikasi ini bisa dipasang ke layar utama sebagai <strong>Perwira Backup</strong>, sehingga terbuka layar
                penuh tanpa bilah alamat, dengan navigasi di bagian bawah layar.
              </p>
              <p>
                Saat aplikasi dibuka, ajakan memasang muncul dari bawah layar di HP, atau di pojok kiri bawah di komputer.
                Kalau ditutup, pilihan itu diingat dan tidak muncul lagi; tombol <strong>Pasang ke layar utama</strong>{' '}
                tetap ada di menu.
              </p>
              <Daftar>
                <li>
                  <strong>iPhone / iPad</strong>: ajakannya berisi petunjuk: tekan tombol Bagikan di Safari lalu{' '}
                  <em>Tambahkan ke Layar Utama</em>. Berjalan walau aksesnya lewat HTTP.
                </li>
                <li>
                  <strong>Android</strong>: ajakannya berisi tombol <em>Pasang</em> sekali tekan, tetapi hanya muncul kalau
                  aplikasi diakses lewat HTTPS. Lewat alamat IP biasa, Chrome memang tidak mengizinkan pemasangan.
                </li>
              </Daftar>
              <Note>
                Saat jaringan putus, aplikasi tetap terbuka tetapi <strong>tidak</strong> menampilkan data lama: angka
                backup sengaja tidak disimpan offline supaya tidak ada status basi yang terlihat seperti status sekarang.
              </Note>
            </Section>

            <Section id="masalah" title="Kalau backup gagal">
              <p>
                Buka detail node dan lihat tab <strong>Riwayat</strong>. Pesan errornya ditampilkan apa adanya dari SSH
                atau <K>mysqldump</K>, dan biasanya sudah cukup menunjuk penyebabnya. Beberapa yang sering muncul:
              </p>
              <Daftar>
                <li><K>exit code 127 … sshpass</K>: <K>sshpass</K> belum terpasang di VPS backup. Pasang, atau pindah ke autentikasi SSH key.</li>
                <li>
                  <K>Permission denied</K>: user SSH atau public key-nya belum benar di perangkat target. Uji manual dari
                  VPS backup sebagai user <K>www-data</K>.
                </li>
                <li><K>Output /export kosong</K>: user MikroTik-nya belum punya policy <K>read</K>.</li>
                <li>
                  <K>Dump tidak lengkap</K>: koneksi terputus di tengah <K>mysqldump</K>. Backup sengaja ditolak alih-alih
                  menyimpan dump separuh yang tidak bisa dipulihkan.
                </li>
                <li>
                  <K>Backup terbaru … sudah basi</K>: khusus Virtualizor, sumbernya berhenti membuat dump baru. Periksa
                  cron backup di node Virtualizor-nya.
                </li>
              </Daftar>
              <p>
                Kalau notifikasi Telegram sudah diatur, kegagalan juga dikirim ke sana dengan jeda antar-peringatan agar
                tidak membanjiri grup, dan ada pemberitahuan saat node yang tadinya gagal kembali berhasil.
              </p>
            </Section>
          </Aktif.Provider>

          <nav aria-label="Bagian lain" className="flex justify-between gap-3 border-t border-[#EEF0F6] pt-5 mt-2 flex-wrap">
            {sebelum ? (
              <Link to={{ hash: sebelum[0] }} className="group flex items-center gap-2 min-h-[44px] text-sm font-semibold text-[#3442D9]">
                <ChevronLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
                {sebelum[1]}
              </Link>
            ) : <span />}
            {sesudah && (
              <Link to={{ hash: sesudah[0] }} className="group flex items-center gap-2 min-h-[44px] text-sm font-semibold text-[#3442D9] ml-auto text-right">
                {sesudah[1]}
                <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </Link>
            )}
          </nav>
        </article>
      </div>
    </div>
  )
}
