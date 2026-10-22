import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, ChevronDown, Copy, RotateCcw } from 'lucide-react'
import api from '../lib/axios'
import { useAuth } from '../context/AuthContext'
import { useRunDoctorAll } from '../hooks/useNodes'
import { Button } from '../components/ui/button'
import { toast } from '../components/ui/toaster'
import { cn, kapan } from '../lib/utils'
import { DoctorTabs } from './DoctorPage'

type Tingkat = 'otomatis' | 'kritis' | 'peringatan' | 'info'

interface Standar {
  noc: string[]
  layanan_mati: string[]
  layanan_dibatasi: string[]
  lisensi_min: 'p1' | 'p10' | 'unlimited'
  kanal: 'ikuti' | 'long-term' | 'stable'
  ntp: string[]
  cpu_maks: number
  ram_min: number
  disk_min: number
  interim: string
  cek: Record<string, { aktif: boolean; tingkat: Tingkat }>
}

interface Respons {
  standar: Standar
  bawaan: Standar
  layanan: Record<string, string>
  cek: { id: string; judul: string; kategori: string; berlaku: string[] }[]
  skrip: string
  diubah: string | null
}

function apiMessage(err: unknown, fallback: string): string {
  const res = (err as { response?: { data?: { message?: string; errors?: Record<string, string[]> } } }).response?.data
  if (res?.errors) return Object.values(res.errors).flat().join(' ')
  return res?.message ?? fallback
}

/** Sama dengan DoctorStandar::alamatSah di backend: IPv4 atau CIDR /0 sampai /32. */
const alamatSah = (a: string) =>
  /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(\/(\d|[12]\d|3[0-2]))?$/.test(a)
  && a.split('/')[0].split('.').every((o) => Number(o) <= 255)

const daftarDari = (teks: string) => teks.split(/[\s,]+/).map((x) => x.trim()).filter(Boolean)

const TINGKAT: [Tingkat, string][] = [['otomatis', 'Otomatis'], ['kritis', 'Kritis'], ['peringatan', 'Perhatian'], ['info', 'Info']]

function Saklar({ nyala, onUbah, label, mati }: { nyala: boolean; onUbah: (v: boolean) => void; label: string; mati?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={nyala}
      aria-label={label}
      disabled={mati}
      onClick={() => onUbah(!nyala)}
      className={cn(
        'relative w-11 h-[26px] rounded-full transition-colors duration-200 flex-shrink-0 disabled:opacity-50',
        nyala ? 'bg-[#4255F0]' : 'bg-[#CBD5E1]',
      )}
    >
      <span className={cn('absolute top-[3px] left-[3px] w-5 h-5 rounded-full bg-white shadow transition-transform duration-200', nyala && 'translate-x-[18px]')} />
    </button>
  )
}

/** Arti tanda di halaman ini: chip bercentang, saklar, dan pilihan tingkat. Contohnya tiruan statis, bukan tombol. */
function Legenda() {
  const saklar = (nyala: boolean) => (
    <span className={cn('relative inline-block w-11 h-[26px] rounded-full flex-shrink-0', nyala ? 'bg-[#4255F0]' : 'bg-[#CBD5E1]')}>
      <span className={cn('absolute top-[3px] left-[3px] w-5 h-5 rounded-full bg-white shadow', nyala && 'translate-x-[18px]')} />
    </span>
  )
  const isi: [React.ReactNode, React.ReactNode][] = [
    [
      <span className="chip" aria-pressed="true"><Check className="w-3.5 h-3.5" strokeWidth={3} />Telnet</span>,
      <>Chip gelap bercentang = <b>dipilih</b>. Di "Wajib mati", Doctor menandai router yang layanan ini masih menyala.
        Di "Wajib dibatasi alamat NOC", Doctor menandai yang menyala tanpa batas address.</>,
    ],
    [
      <span className="chip">FTP</span>,
      <>Chip putih tanpa centang = <b>tidak dipilih</b>: layanan ini tidak diperiksa di daftar tersebut.
        Untuk lisensi dan kanal, chip gelap adalah pilihan yang sedang dipakai.</>,
    ],
    [
      <span className="flex gap-2">{saklar(true)}{saklar(false)}</span>,
      <>Saklar biru = pemeriksaan <b>dijalankan</b>. Saklar abu-abu = <b>dilewati</b>: tidak dinilai dan tidak muncul di hasil Doctor.</>,
    ],
    [
      <span className="pilih inline-flex items-center gap-5">Otomatis<ChevronDown className="w-4 h-4 text-[#475569]" /></span>,
      <><b>Otomatis</b> = Doctor memilih tingkat sesuai keadaan router (mis. kritis kalau terbuka ke internet).
        Kritis, Perhatian, atau Info = temuan selalu dipasang di tingkat itu.</>,
    ],
  ]
  return (
    <section className="card p-5 md:p-6" aria-labelledby="legenda-standar">
      <h2 id="legenda-standar" className="text-[15px] font-bold">Arti tanda di halaman ini</h2>
      <dl className="grid sm:grid-cols-2 xl:grid-cols-4 gap-x-5 gap-y-4 mt-3">
        {isi.map(([contoh, arti], i) => (
          <div key={i} className="flex flex-col gap-2">
            <dt aria-hidden="true">{contoh}</dt>
            <dd className="text-[13px] text-[#475569] leading-relaxed">{arti}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

function Bagian({ judul, ket, children }: { judul: string; ket?: string; children: React.ReactNode }) {
  return (
    <section className="card p-5 md:p-6 flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-bold">{judul}</h2>
        {ket && <p className="text-[13px] text-[#475569] mt-1 leading-relaxed">{ket}</p>}
      </div>
      {children}
    </section>
  )
}

export default function DoctorStandarPage() {
  const { isAdmin, isOperator } = useAuth()
  const qc = useQueryClient()
  const semua = useRunDoctorAll()
  const { data, isLoading } = useQuery<{ data: Respons }>({
    queryKey: ['doctor-standar'],
    queryFn: () => api.get('/doctor/standar').then((r) => r.data),
  })
  const simpan = useMutation({
    mutationFn: (s: Standar) => api.put('/doctor/standar', s).then((r) => r.data),
    onSuccess: (res) => qc.setQueryData(['doctor-standar'], res),
  })

  const r = data?.data
  const [form, setForm] = useState<Standar | null>(null)
  const [nocTeks, setNocTeks] = useState('')
  const [ntpTeks, setNtpTeks] = useState('')
  const [baruDisimpan, setBaruDisimpan] = useState(false)
  const [tersalin, setTersalin] = useState(false)

  const isi = (s: Standar) => {
    setForm(s)
    setNocTeks(s.noc.join('\n'))
    setNtpTeks(s.ntp.join(', '))
  }
  useEffect(() => { if (r && !form) isi(r.standar) }, [r])

  if (isLoading || !r || !form) {
    return (
      <div className="space-y-5 max-w-screen-2xl">
        <DoctorTabs />
        <div className="card p-8 text-center text-sm text-[#475569] animate-pulse">Memuat standar…</div>
      </div>
    )
  }

  const ubah = <K extends keyof Standar>(k: K, v: Standar[K]) => setForm({ ...form, [k]: v })
  const nocList = daftarDari(nocTeks)
  const nocSalah = nocList.filter((a) => !alamatSah(a))
  const kirim: Standar = { ...form, noc: nocList, ntp: daftarDari(ntpTeks) }
  const berubah = JSON.stringify(kirim) !== JSON.stringify(r.standar)
  const cekAktif = (id: string) => form.cek[id]?.aktif ?? true
  const tingkat = (id: string): Tingkat => form.cek[id]?.tingkat ?? 'otomatis'
  const ubahCek = (id: string, v: Partial<{ aktif: boolean; tingkat: Tingkat }>) =>
    ubah('cek', { ...form.cek, [id]: { aktif: cekAktif(id), tingkat: tingkat(id), ...v } })
  const toggleLayanan = (k: 'layanan_mati' | 'layanan_dibatasi', l: string) =>
    ubah(k, form[k].includes(l) ? form[k].filter((x) => x !== l) : [...form[k], l])
  const kategori = [...new Set(r.cek.map((c) => c.kategori))]
  const kunci = !isAdmin

  const handleSimpan = async () => {
    try {
      const res = await simpan.mutateAsync(kirim)
      isi(res.data.standar)
      setBaruDisimpan(true)
      toast('Standar disimpan. Berlaku pada pemeriksaan berikutnya.', 'success')
    } catch (err) {
      toast(apiMessage(err, 'Gagal menyimpan standar'), 'error')
    }
  }

  const salin = async () => {
    try {
      await navigator.clipboard.writeText(r.skrip)
      setTersalin(true)
      setTimeout(() => setTersalin(false), 2000)
    } catch {
      toast('Tidak bisa menyalin otomatis; pilih teksnya lalu salin manual.', 'error')
    }
  }

  return (
    <div className="space-y-5 max-w-screen-2xl pb-24 md:pb-0">
      <DoctorTabs />

      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div className="max-w-3xl">
          <h1 className="text-[28px] leading-tight font-extrabold text-[#0F172A]">Standar Doctor</h1>
          <p className="text-sm text-[#475569] mt-1">
            Seperti apa router Perwira yang benar. Doctor menilai setiap MikroTik terhadap standar ini.
            {r.diubah && <> Terakhir diubah {kapan(r.diubah)}.</>}
          </p>
        </div>
        {!kunci && (
          <div className="hidden md:flex gap-2.5">
            <Button variant="secondary" onClick={() => isi({ ...r.bawaan, cek: {} })} disabled={simpan.isPending}>
              <RotateCcw className="w-4 h-4" />
              Kembalikan bawaan
            </Button>
            <Button onClick={handleSimpan} loading={simpan.isPending} disabled={!berubah || nocSalah.length > 0}>
              Simpan standar
            </Button>
          </div>
        )}
      </header>

      {kunci && (
        <p className="rounded-xl bg-[#EEF0FE] text-[#1E2A78] px-4 py-3 text-sm">
          Hanya admin yang bisa mengubah standar. Anda bisa melihatnya dan menyalin skrip dasar.
        </p>
      )}

      <Legenda />

      {baruDisimpan && isOperator && (
        <div className="rounded-2xl bg-[#DCFCE7] text-[#14532D] px-4 py-3 flex items-center justify-between gap-3 flex-wrap animate-masuk">
          <span className="text-sm font-semibold">Standar baru disimpan. Laporan Doctor ikut berubah setelah router diperiksa ulang.</span>
          <Button
            size="sm"
            loading={semua.isPending}
            onClick={async () => {
              try {
                const res = await semua.mutateAsync()
                toast(`${res.message}, hasilnya muncul bertahap`, 'info')
                setBaruDisimpan(false)
              } catch (err) {
                toast(apiMessage(err, 'Gagal menjalankan Doctor'), 'error')
              }
            }}
          >
            Periksa semua sekarang
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 items-start">
        <div className="flex flex-col gap-5">
          <Bagian
            judul="Alamat NOC"
            ket="Satu alamat atau CIDR per baris. Dipakai untuk batas address layanan manajemen dan aturan firewall di perintah perbaikan. Kosongkan untuk mengikuti batas address SSH di masing-masing router."
          >
            <textarea
              value={nocTeks}
              onChange={(e) => setNocTeks(e.target.value)}
              disabled={kunci}
              rows={4}
              placeholder={'203.0.113.7/32\n198.51.100.0/28'}
              aria-label="Alamat NOC"
              className="w-full rounded-xl border border-[#DADDE8] bg-[#F8F9FC] px-3.5 py-3 font-mono text-sm focus:outline-none focus:bg-white focus:border-[#4255F0] focus:ring-4 focus:ring-[#4255F0]/15 disabled:opacity-70"
            />
            {nocSalah.length > 0 && (
              <p role="alert" className="text-[13px] text-[#991B1B]">Bukan IPv4 atau CIDR yang sah: {nocSalah.join(', ')}</p>
            )}
          </Bagian>

          <Bagian judul="Layanan router" ket="Ketuk untuk memilih. Layanan yang dipilih diperiksa di setiap MikroTik.">
            {([
              ['layanan_mati', 'Wajib mati', 'Layanan yang tidak boleh aktif sama sekali.'],
              ['layanan_dibatasi', 'Wajib dibatasi alamat NOC', 'Kalau aktif, address-nya harus terisi (router ber-IP publik).'],
            ] as const).map(([k, judul, ket]) => (
              <div key={k}>
                <p className="text-sm font-semibold">{judul}</p>
                <p className="text-xs text-[#475569] mb-2">{ket}</p>
                <div className="flex gap-2 flex-wrap">
                  {Object.entries(r.layanan).map(([l, nama]) => (
                    <button key={l} type="button" disabled={kunci} aria-pressed={form[k].includes(l)} onClick={() => toggleLayanan(k, l)} className="chip disabled:opacity-60">
                      {form[k].includes(l) && <Check className="w-3.5 h-3.5" strokeWidth={3} />}
                      {nama}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </Bagian>

          <Bagian judul="Sistem dan CHR">
            <div>
              <p className="text-sm font-semibold mb-2">Lisensi CHR minimal</p>
              <div className="flex gap-2 flex-wrap">
                {(['p1', 'p10', 'unlimited'] as const).map((l) => (
                  <button key={l} type="button" disabled={kunci} aria-pressed={form.lisensi_min === l} onClick={() => ubah('lisensi_min', l)} className="chip disabled:opacity-60">
                    {l === 'unlimited' ? 'Unlimited' : l.toUpperCase()}
                  </button>
                ))}
              </div>
              <p className="text-xs text-[#475569] mt-1.5">
                Lisensi free selalu kritis: upload dibatasi 1 Mbps per interface. Kalau Limited Upgrades tercentang di
                System &gt; License, lisensi dan saran upgrade RouterOS hanya dicatat sebagai info: router tetap jalan,
                tetapi RouterOS tidak bisa di-upgrade.
              </p>
            </div>
            <div>
              <p className="text-sm font-semibold mb-2">Kanal RouterOS</p>
              <div className="flex gap-2 flex-wrap">
                {([['ikuti', 'Ikuti kanal router'], ['long-term', 'long-term'], ['stable', 'stable']] as const).map(([v, l]) => (
                  <button key={v} type="button" disabled={kunci} aria-pressed={form.kanal === v} onClick={() => ubah('kanal', v)} className="chip disabled:opacity-60">
                    {l}
                  </button>
                ))}
              </div>
            </div>
            <label className="flex flex-col gap-1.5 text-sm font-semibold">
              Server NTP
              <input
                value={ntpTeks}
                onChange={(e) => setNtpTeks(e.target.value)}
                disabled={kunci}
                placeholder="id.pool.ntp.org, time.google.com"
                className="h-11 px-3.5 rounded-xl border border-[#DADDE8] bg-[#F8F9FC] font-mono text-sm font-normal focus:outline-none focus:bg-white focus:border-[#4255F0] focus:ring-4 focus:ring-[#4255F0]/15 disabled:opacity-70"
              />
              <span className="text-xs font-normal text-[#475569]">Dipisah koma, maksimal 4. Dipakai di perintah perbaikan NTP.</span>
            </label>
            <div className="grid grid-cols-3 gap-3">
              {([['cpu_maks', 'CPU maksimal', 50, 100], ['ram_min', 'RAM bebas minimal', 1, 50], ['disk_min', 'Disk bebas minimal', 1, 50]] as const).map(([k, l, min, max]) => (
                <label key={k} className="flex flex-col gap-1.5 text-[13px] font-semibold">
                  {l}
                  <span className="relative">
                    <input
                      type="number"
                      min={min}
                      max={max}
                      value={form[k]}
                      disabled={kunci}
                      onChange={(e) => ubah(k, Number(e.target.value))}
                      onBlur={() => ubah(k, Math.max(min, Math.min(max, Math.round(form[k]) || min)))}
                      className="w-full h-11 pl-3.5 pr-8 rounded-xl border border-[#DADDE8] bg-[#F8F9FC] text-sm font-semibold focus:outline-none focus:bg-white focus:border-[#4255F0] focus:ring-4 focus:ring-[#4255F0]/15 disabled:opacity-70"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#475569] text-sm">%</span>
                  </span>
                </label>
              ))}
            </div>
            <label className="flex items-center justify-between gap-3 text-sm font-semibold flex-wrap">
              Interim update RADIUS (PPPoE)
              <input
                value={form.interim}
                onChange={(e) => ubah('interim', e.target.value.trim())}
                disabled={kunci}
                placeholder="5m"
                className="w-28 h-10 px-3 rounded-[10px] border border-[#DADDE8] bg-white font-mono text-sm focus:outline-none focus:border-[#4255F0] focus:ring-4 focus:ring-[#4255F0]/15 disabled:opacity-70"
              />
            </label>
          </Bagian>
        </div>

        <div className="flex flex-col gap-5">
          <Bagian
            judul="Pemeriksaan"
            ket="Matikan pemeriksaan yang tidak berlaku untuk Perwira, atau paksa tingkatnya. Otomatis = tingkat dipilih Doctor sesuai keadaan router (mis. kritis kalau terbuka ke internet)."
          >
            {kategori.map((kat) => (
              <div key={kat}>
                <p className="text-[11px] font-bold tracking-[0.08em] text-[#475569] mb-1">{kat.toUpperCase()}</p>
                <ul className="divide-y divide-[#EEF0F6]">
                  {r.cek.filter((c) => c.kategori === kat).map((c) => (
                    <li key={c.id} className="flex items-center gap-3 py-2.5 flex-wrap sm:flex-nowrap">
                      <Saklar nyala={cekAktif(c.id)} onUbah={(v) => ubahCek(c.id, { aktif: v })} label={`Aktifkan ${c.judul}`} mati={kunci} />
                      <div className={cn('min-w-0 flex-1 transition-opacity', !cekAktif(c.id) && 'opacity-50')}>
                        <p className="text-sm font-semibold">{c.judul}</p>
                        <p className="flex gap-1 flex-wrap mt-0.5">
                          {c.berlaku.map((b) => (
                            <span key={b} className="px-2 rounded-full border border-[#DADDE8] text-[11px] font-semibold text-[#334155]">{b}</span>
                          ))}
                        </p>
                      </div>
                      <select
                        value={tingkat(c.id)}
                        onChange={(e) => ubahCek(c.id, { tingkat: e.target.value as Tingkat })}
                        disabled={kunci || !cekAktif(c.id)}
                        aria-label={`Tingkat ${c.judul}`}
                        className="pilih disabled:opacity-50 ml-14 sm:ml-0"
                      >
                        {TINGKAT.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </Bagian>

          <Bagian
            judul="Skrip dasar router baru"
            ket="Konfigurasi awal CHR atau router Perwira yang memenuhi standar tersimpan. Pakai saat memasang router baru; untuk router yang sudah berjalan, ikuti perbaikan di tab Doctor masing-masing."
          >
            <div className="rounded-[14px] bg-[#0F172A] overflow-hidden">
              <div className="flex items-center justify-between gap-3 px-4 py-2 bg-[#111827] border-b border-white/5">
                <span className="text-xs font-semibold text-[#CBD5E1]">RouterOS 7 · tempel per bagian</span>
                <button
                  type="button"
                  onClick={salin}
                  className="h-8 px-3 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors"
                >
                  {tersalin ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {tersalin ? 'Tersalin' : 'Salin skrip'}
                </button>
              </div>
              <pre className="text-[#E2E8F0] px-4 py-4 font-mono text-[12.5px] leading-[1.7] overflow-auto whitespace-pre max-h-[420px]">
                {r.skrip}
              </pre>
            </div>
            {berubah && <p className="text-xs text-[#92400E]">Skrip ini mengikuti standar yang tersimpan; simpan dulu untuk melihat perubahan Anda.</p>}
          </Bagian>
        </div>
      </div>

      {/* HP: tombol simpan menempel di bawah, di atas navigasi. */}
      {!kunci && (
        <div className="md:hidden fixed inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-20 px-4">
          <div className="flex gap-2 bg-white rounded-2xl p-2 shadow-[0_10px_30px_-12px_rgba(15,23,42,0.4)]">
            <Button variant="secondary" className="flex-1 justify-center" onClick={() => isi({ ...r.bawaan, cek: {} })}>Bawaan</Button>
            <Button className="flex-[2] justify-center" onClick={handleSimpan} loading={simpan.isPending} disabled={!berubah || nocSalah.length > 0}>
              Simpan standar
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
