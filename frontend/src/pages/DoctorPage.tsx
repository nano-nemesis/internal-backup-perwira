import { Link, NavLink } from 'react-router-dom'
import { useNodes, useRunDoctorAll } from '../hooks/useNodes'
import { useAuth } from '../context/AuthContext'
import { Button } from '../components/ui/button'
import { toast } from '../components/ui/toaster'
import { ArtiStatus, PeranBadges, hitungDoctor } from '../components/nodes/DoctorPanel'
import { cn, formatDatetimeWIB } from '../lib/utils'
import { Hitung } from '../components/ui/hitung'

/** Tab di atas menu Doctor: hasil pemeriksaan dan standar yang dipakai menilainya. */
export function DoctorTabs() {
  const kelas = ({ isActive }: { isActive: boolean }) =>
    cn('px-4 min-h-[40px] rounded-full text-sm font-semibold flex items-center transition-colors',
      isActive ? 'bg-white text-[#0F172A] shadow-[0_1px_3px_rgba(15,23,42,0.12)]' : 'text-[#475569] hover:text-[#0F172A]')
  return (
    <nav aria-label="Bagian Doctor" className="inline-flex gap-1 p-1 rounded-full bg-[#E8EAF2]">
      <NavLink to="/doctor" end className={kelas}>Hasil</NavLink>
      <NavLink to="/doctor/standar" className={kelas}>Standar</NavLink>
    </nav>
  )
}

export default function DoctorPage() {
  const { data, isLoading } = useNodes()
  const { isOperator } = useAuth()
  const semua = useRunDoctorAll()

  const hitung = hitungDoctor(data?.data ?? [])
  const nodes = hitung.urut

  const periksaSemua = async () => {
    try {
      const r = await semua.mutateAsync()
      toast(`${r.message}, hasilnya muncul bertahap`, 'info')
    } catch (err: any) {
      toast(err.response?.data?.message ?? 'Gagal menjalankan doctor', 'error')
    }
  }

  // Temuan utama tiap router, dikelompokkan: menunjukkan masalah yang paling merata.
  const terbanyak = Object.entries(
    nodes.reduce<Record<string, number>>((acc, n) => {
      const u = n.doctor?.utama
      if (u) acc[u] = (acc[u] ?? 0) + 1
      return acc
    }, {}),
  ).sort((a, b) => b[1] - a[1]).slice(0, 5)

  const kartu: [string, number, string, boolean?][] = [
    ['Kritis', hitung.kritis, 'text-white', true],
    ['Perlu perhatian', hitung.perhatian, 'text-[#B45309]'],
    ['Sesuai standar', hitung.sehat, 'text-[#15803D]'],
    ['Belum/gagal diperiksa', hitung.belum, 'text-[#0F172A]'],
  ]

  return (
    <div className="space-y-5 max-w-screen-2xl">
      <DoctorTabs />
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div className="max-w-3xl">
          <h1 className="text-[28px] leading-tight font-extrabold text-[#0F172A]">Doctor</h1>
          <p className="text-sm text-[#475569] mt-1">
            Doctor memeriksa konfigurasi setiap router MikroTik terhadap{' '}
            <Link to="/doctor/standar" className="font-semibold text-[#3442D9] hover:underline">standar Perwira</Link> (keamanan,
            lisensi CHR, PPPoE, VPN, dan sistem), lalu menuliskan apa yang salah, akibatnya, dan perintah perbaikannya.
            Buka router untuk melihat rinciannya. Hasil diperbarui setiap backup berhasil.
          </p>
        </div>
        {isOperator && (
          <Button onClick={periksaSemua} loading={semua.isPending}>
            Periksa semua
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-5 berurutan">
        {kartu.map(([label, n, warna, hero]) => (
          <section
            key={label}
            className={cn('rounded-[20px] p-4 md:p-5', hero ? 'bg-[#4255F0] shadow-[0_12px_24px_-12px_#4255F0CC]' : 'bg-white')}
          >
            <p className={cn('text-[13px] font-semibold', hero ? 'text-white' : 'text-[#334155]')}>{label}</p>
            <p className={cn('text-[30px] leading-none font-extrabold mt-2', warna)}><Hitung n={n} /></p>
            <p className={cn('text-xs mt-1', hero ? 'text-[#E6E9FF]' : 'text-[#475569]')}>router</p>
          </section>
        ))}
      </div>

      {terbanyak.length > 0 && (
        <section className="card p-5 md:p-6 space-y-3.5">
          <div>
            <h2 className="text-lg font-bold">Temuan utama terbanyak</h2>
            <p className="text-[13px] text-[#475569] mt-1">Masalah paling berat di tiap router, dikelompokkan. Angka di kanan = jumlah router.</p>
          </div>
          {terbanyak.map(([teks, jml]) => (
            <div key={teks}>
              <div className="flex justify-between gap-3 text-[13px] font-semibold">
                <span className="min-w-0 break-words">{teks}</span>
                <span>{jml}</span>
              </div>
              <div className="h-2 rounded-full bg-[#F1F2F7] mt-1.5">
                <div className="h-2 rounded-full bg-[#4255F0] animate-tumbuh" style={{ width: `${(jml / nodes.length) * 100}%` }} />
              </div>
            </div>
          ))}
        </section>
      )}

      <section className="card p-5 md:p-6 space-y-2.5">
        <h2 className="text-[15px] font-bold">Arti tingkat temuan</h2>
        <ArtiStatus />
      </section>

      <section className="card divide-y divide-[#EEF0F6] overflow-hidden">
        {isLoading && <p className="p-5 text-sm text-[#475569] animate-pulse">Memuat…</p>}
        {!isLoading && nodes.length === 0 && (
          <p className="p-5 text-sm text-[#475569]">Belum ada node MikroTik.</p>
        )}
        {nodes.map((n) => {
          const r = n.doctor?.ringkasan
          return (
            <Link
              key={n.id}
              to={`/devices/${n.id}?tab=doctor`}
              className="group flex items-start gap-3 md:gap-4 px-5 md:px-6 py-4 hover:bg-[#F8F9FC] transition-colors flex-wrap sm:flex-nowrap"
            >
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-[#0F172A]">{n.name}</span>
                  <PeranBadges peran={n.doctor?.peran} />
                </div>
                <p className="text-[13px] text-[#475569] break-words">
                  {n.doctor?.galat
                    ? <span className="text-[#991B1B]">Tidak bisa diperiksa: {n.doctor.galat}</span>
                    : n.doctor
                      ? n.doctor.utama ?? 'Sesuai standar.'
                      : 'Belum pernah diperiksa.'}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {r && r.kritis > 0 && <span className="pill bg-[#DC2626] text-white">{r.kritis} kritis</span>}
                {r && r.peringatan > 0 && <span className="pill bg-[#FEF3C7] text-[#92400E]">{r.peringatan} perhatian</span>}
                {r && !r.kritis && !r.peringatan && <span className="pill bg-[#BBF7D0] text-[#14532D]">sesuai</span>}
                <span className="text-xs text-[#475569] w-36 text-right hidden lg:inline">
                  {n.doctor_checked_at ? formatDatetimeWIB(n.doctor_checked_at) : '-'}
                </span>
              </div>
            </Link>
          )
        })}
      </section>
    </div>
  )
}
