import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, ClipboardList } from 'lucide-react'
import { useLaporanBackup } from '../hooks/useLaporanBackup'
import { LABEL_TIPE } from '../components/nodes/NodeTable'
import { Hitung } from '../components/ui/hitung'
import { cn, kapan } from '../lib/utils'
import type { PerangkatLaporan, StatusLaporan } from '../types'

const STATUS: Record<StatusLaporan, { label: string; ket: string; gaya: string; titik: string }> = {
  gagal: { label: 'Gagal semua', ket: 'tidak ada satu pun backup yang berhasil', gaya: 'bg-[#FEE2E2] text-[#991B1B]', titik: 'bg-[#EF4444]' },
  sebagian: { label: 'Kadang gagal', ket: 'ada yang berhasil, ada yang gagal', gaya: 'bg-[#FEF3C7] text-[#92400E]', titik: 'bg-[#F59E0B]' },
  tanpa: { label: 'Tidak ada backup', ket: 'tidak ada catatan backup sama sekali', gaya: 'bg-[#E5E7EB] text-[#374151]', titik: 'bg-[#94A3B8]' },
  berhasil: { label: 'Berhasil semua', ket: 'semua backup berhasil', gaya: 'bg-[#BBF7D0] text-[#14532D]', titik: 'bg-[#22C55E]' },
}

const inputCls =
  'px-3.5 min-h-[44px] bg-white border border-[#DADDE8] rounded-xl text-sm text-[#0F172A] focus:outline-none focus:border-[#4255F0] focus:ring-4 focus:ring-[#4255F0]/15'

// Tanggal kalender WIB, sama dengan zona waktu server.
const hariIni = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' })
const mundur = (tgl: string, hari: number) => new Date(Date.parse(tgl) - hari * 86_400_000).toISOString().slice(0, 10)
const PRESET = [
  { label: 'Hari ini', hari: 0 },
  { label: '7 hari', hari: 6 },
  { label: '30 hari', hari: 29 },
  { label: '90 hari', hari: 89 },
]

function Perangkat({ p }: { p: PerangkatLaporan }) {
  const [buka, setBuka] = useState(false)
  const st = STATUS[p.status]
  const total = p.berhasil + p.gagal
  const tipe = p.tipe ? LABEL_TIPE[p.tipe] : null

  return (
    <li className="card overflow-hidden">
      <button
        onClick={() => setBuka((b) => !b)}
        aria-expanded={buka}
        disabled={!p.sebab.length}
        className="w-full text-left p-4 md:px-5 flex gap-3 items-start enabled:hover:bg-[#F8F9FC] transition-colors"
      >
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-sm font-bold text-[#0F172A] break-all">{p.nama}</span>
            {tipe && <span className={cn('pill', tipe.gaya)}>{tipe.teks}</span>}
            <span className={cn('pill', st.gaya)}>{st.label}</span>
            {!p.terdaftar && <span className="pill bg-[#F1F2F7] text-[#475569]">sudah dihapus</span>}
          </div>
          <p className="text-xs text-[#475569] mt-1.5 tabular-nums flex flex-wrap gap-x-3 gap-y-0.5">
            <span><b className="text-[#14532D]">{p.berhasil}</b> berhasil</span>
            <span><b className={p.gagal ? 'text-[#991B1B]' : 'text-[#0F172A]'}>{p.gagal}</b> gagal</span>
            {p.terakhir && <span>terakhir {p.terakhir.status} {kapan(p.terakhir.waktu)}</span>}
            {p.status === 'gagal' && <span>berhasil terakhir {p.backup_terakhir ? kapan(p.backup_terakhir) : 'belum pernah'}</span>}
          </p>
          {total > 0 && (
            <div className="mt-2 h-1.5 rounded-full bg-[#E4E6EE] flex overflow-hidden" aria-hidden>
              <span className="bg-[#22C55E]" style={{ width: `${(p.berhasil / total) * 100}%` }} />
              <span className="bg-[#EF4444]" style={{ width: `${(p.gagal / total) * 100}%` }} />
            </div>
          )}
          {!buka && p.sebab[0] && <p className="text-xs text-[#991B1B] mt-2 break-words">{p.sebab[0].sebab}</p>}
        </div>
        {/* Selalu dirender (tak terlihat kalau tak ada sebab) supaya bilah semua baris sama panjang. */}
        <ChevronDown className={cn('w-4 h-4 mt-0.5 text-[#94A3B8] flex-shrink-0 transition-transform', buka && 'rotate-180', !p.sebab.length && 'invisible')} />
      </button>

      {buka && (
        <div className="px-4 md:px-5 pb-4 pt-3 border-t border-[#EEF0F6] space-y-3">
          {p.sebab.map((s) => (
            <div key={s.sebab}>
              <p className="text-sm font-semibold text-[#0F172A]">
                {s.sebab} <span className="font-normal text-[#475569] tabular-nums">· {s.jumlah}x, terakhir {kapan(s.terakhir)}</span>
              </p>
              {s.error && (
                <pre className="mt-1.5 whitespace-pre-wrap break-all text-xs font-mono bg-[#F4F5FA] rounded-xl p-3 max-h-48 overflow-auto">
                  {s.error}
                </pre>
              )}
            </div>
          ))}
          {p.terdaftar && (
            <Link to={`/devices/${p.id}`} className="inline-block text-sm font-semibold text-[#4255F0] hover:underline">
              Buka halaman perangkat
            </Link>
          )}
        </div>
      )}
    </li>
  )
}

export default function LaporanPage() {
  const [sampai, setSampai] = useState(hariIni)
  const [dari, setDari] = useState(() => mundur(hariIni(), 6))
  const [filter, setFilter] = useState<StatusLaporan | ''>('')
  const { data, isLoading, isError } = useLaporanBackup(dari, sampai)

  const r = data?.ringkasan
  const daftar = (data?.perangkat ?? []).filter((p) => !filter || p.status === filter)
  const terbalik = dari > sampai

  return (
    <div className="space-y-5 max-w-screen-2xl">
      <div>
        <h1 className="text-[28px] leading-tight font-extrabold text-[#0F172A]">Laporan Backup</h1>
        <p className="text-sm text-[#475569] mt-1">
          Hasil backup setiap perangkat dalam rentang waktu: berapa yang berhasil, berapa yang gagal, dan sebabnya.
        </p>
      </div>

      <div className="card p-3 md:p-4 flex flex-col lg:flex-row lg:items-center gap-3">
        <div className="flex flex-wrap gap-2">
          {PRESET.map(({ label, hari }) => {
            const aktif = sampai === hariIni() && dari === mundur(sampai, hari)
            return (
              <button
                key={label}
                className="chip"
                aria-pressed={aktif}
                onClick={() => { const s = hariIni(); setSampai(s); setDari(mundur(s, hari)) }}
              >
                {label}
              </button>
            )
          })}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 lg:ml-auto">
          <label className="flex items-center gap-2 text-xs text-[#475569]">
            Dari
            <input type="date" value={dari} max={sampai} onChange={(e) => setDari(e.target.value)} className={cn(inputCls, 'flex-1 min-w-0')} />
          </label>
          <label className="flex items-center gap-2 text-xs text-[#475569]">
            Sampai
            <input type="date" value={sampai} min={dari} max={hariIni()} onChange={(e) => setSampai(e.target.value)} className={cn(inputCls, 'flex-1 min-w-0')} />
          </label>
        </div>
      </div>

      {terbalik && <div className="card p-4 text-sm text-[#991B1B]">Tanggal "dari" harus sebelum atau sama dengan "sampai".</div>}
      {isLoading && <div className="card p-8 text-center text-[#475569] text-sm animate-pulse">Menyusun laporan…</div>}
      {isError && <div className="card p-8 text-center text-[#991B1B] text-sm">Gagal memuat laporan. Coba muat ulang halaman.</div>}

      {r && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-5 berurutan">
            {(['berhasil', 'sebagian', 'gagal', 'tanpa'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setFilter(filter === s ? '' : s)}
                aria-pressed={filter === s}
                className={cn('card p-4 text-left transition-shadow hover:shadow-md', filter === s && 'ring-2 ring-[#4255F0]')}
              >
                <p className="text-[13px] font-semibold text-[#334155] flex items-start gap-2">
                  <span className={cn('w-2.5 h-2.5 mt-1 rounded-full flex-shrink-0', STATUS[s].titik)} aria-hidden />
                  {STATUS[s].label}
                </p>
                <p className="text-[30px] leading-none font-extrabold text-[#0F172A] mt-2"><Hitung n={r[s]} /></p>
                <p className="text-xs text-[#475569] mt-1.5">{STATUS[s].ket}</p>
              </button>
            ))}
          </div>

          <p className="text-sm text-[#475569] tabular-nums">
            {r.perangkat} perangkat · {r.run_berhasil.toLocaleString('id-ID')} backup berhasil ·{' '}
            {r.run_gagal.toLocaleString('id-ID')} gagal
            {r.nonaktif > 0 && ` · ${r.nonaktif} perangkat nonaktif tanpa catatan tidak dihitung`}
            {` · riwayat disimpan ${data.retensi_hari} hari`}
          </p>

          {data.sebab.length > 0 && (
            <section className="card p-4 md:p-5">
              <h2 className="text-base font-bold text-[#0F172A]">Penyebab gagal</h2>
              <ul className="mt-3 divide-y divide-[#EEF0F6]">
                {data.sebab.map((s) => (
                  <li key={s.sebab} className="py-2.5 flex gap-3 items-start">
                    <span className="text-lg font-extrabold text-[#991B1B] tabular-nums w-10 flex-shrink-0 text-right">{s.jumlah}x</span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[#0F172A] break-words">{s.sebab}</p>
                      <p className="text-xs text-[#475569] mt-0.5 break-words">{s.perangkat.join(', ')}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {daftar.length === 0 ? (
            <div className="card p-16 text-center">
              <ClipboardList className="w-12 h-12 text-[#CBD5E1] mx-auto mb-4" />
              <p className="text-[#475569] font-medium">Tidak ada perangkat yang cocok.</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {daftar.map((p) => <Perangkat key={p.id} p={p} />)}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
