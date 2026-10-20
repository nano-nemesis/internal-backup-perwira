import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Download, HardDrive, ChevronLeft, ChevronRight, Search, FlaskConical } from 'lucide-react'
import { useBackupFiles } from '../hooks/useBackupFiles'
import { useNodes } from '../hooks/useNodes'
import { cn, kapan, ukuran } from '../lib/utils'
import type { BackupFileItem, JenisBerkas, UrutBerkas } from '../types'
import { useAuth } from '../context/AuthContext'
import { Hitung } from '../components/ui/hitung'

const PER_PAGE = 20

const JENIS: Record<JenisBerkas, { label: string; gaya: string; warna: string }> = {
  rsc: { label: '.rsc', gaya: 'bg-[#FFEDD5] text-[#9A3412]', warna: '#4255F0' },
  backup: { label: '.backup', gaya: 'bg-[#E0E3FF] text-[#2E3AC2]', warna: '#A5B4FC' },
  sql: { label: '.sql.gz', gaya: 'bg-[#CCFBF1] text-[#115E59]', warna: '#14B8A6' },
  lain: { label: 'lain', gaya: 'bg-[#E5E7EB] text-[#374151]', warna: '#C9CCD8' },
}

/** Sama dengan App\Support\DaftarBerkas::jenis di backend. */
const jenisDari = (f: string): JenisBerkas => {
  const n = f.toLowerCase()
  return n.endsWith('.rsc') ? 'rsc' : n.endsWith('.backup') ? 'backup' : n.endsWith('.sql.gz') || n.endsWith('.sql') ? 'sql' : 'lain'
}

const URUT: [UrutBerkas, string][] = [
  ['terbaru', 'Terbaru'],
  ['terlama', 'Terlama'],
  ['nama', 'Nama node A–Z'],
  ['terbesar', 'Ukuran terbesar'],
]

/** Simulasi restore hanya untuk berkas MikroTik yang node-nya masih terdaftar. */
const bisaSimulasi = (f: BackupFileItem) =>
  f.type === 'mikrotik' && !!f.node_id && (jenisDari(f.filename) === 'rsc' || jenisDari(f.filename) === 'backup')

function Aksi({ file }: { file: BackupFileItem }) {
  const { isOperator } = useAuth()
  return (
    <div className="flex items-center justify-end gap-1.5">
      {bisaSimulasi(file) && (
        <Link
          to={`/devices/${file.node_id}?tab=simulasi&berkas=${encodeURIComponent(file.filename)}`}
          className="inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-[10px] text-[13px] font-semibold text-[#2E3AC2] hover:bg-[#EEF0FE] transition-colors whitespace-nowrap"
        >
          <FlaskConical className="w-4 h-4 lg:hidden" />
          <span className="hidden lg:inline">Simulasi restore</span>
          <span className="lg:hidden sr-only">Simulasi restore</span>
        </Link>
      )}
      {/* Sejalan dengan API: unduhan hanya untuk operator ke atas. */}
      {isOperator && (
        <a
          href={file.download_url}
          download={file.filename}
          title={`Unduh ${file.filename}`}
          className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 rounded-[10px] bg-[#EEF0FE] hover:bg-[#E0E3FF] text-[#2E3AC2] text-[13px] font-semibold transition-colors"
        >
          <Download className="w-4 h-4" />
          <span className="hidden sm:inline">Unduh</span>
          <span className="sm:hidden sr-only">Unduh</span>
        </a>
      )}
    </div>
  )
}

export default function BackupFilesPage() {
  // Saringan disimpan di URL: kembali dari halaman simulasi, pencariannya masih sama.
  const [sp, setSp] = useSearchParams()
  const atur = (ubah: Record<string, string>) =>
    setSp((p) => {
      for (const [k, v] of Object.entries(ubah)) if (v) p.set(k, v); else p.delete(k)
      if (!('page' in ubah)) p.delete('page')
      return p
    }, { replace: true })

  const q = sp.get('q') ?? ''
  const jenis = (['rsc', 'backup', 'sql'] as const).find((j) => j === sp.get('jenis')) ?? ''
  const nodeId = sp.get('node') ?? ''
  const urut = URUT.find(([k]) => k === sp.get('urut'))?.[0] ?? 'terbaru'
  const page = Math.max(1, Number(sp.get('page')) || 1)

  // Ketikan langsung tampil di kotak; permintaan ke server menunggu jeda mengetik.
  const [ketik, setKetik] = useState(q)
  useEffect(() => {
    const t = setTimeout(() => { if (ketik.trim() !== q) atur({ q: ketik.trim() }) }, 350)
    return () => clearTimeout(t)
  }, [ketik])

  const { data, isLoading, isFetching } = useBackupFiles({
    node_id: nodeId || undefined,
    jenis,
    q: q || undefined,
    urut,
    page,
    per_page: PER_PAGE,
  })
  const { data: nodesData } = useNodes()

  const files = data?.data ?? []
  const meta = data?.meta
  const r = data?.ringkasan
  const disk = r?.disk
  const terpakai = disk ? disk.total - disk.bebas : 0
  const adaSaringan = !!(q || jenis || nodeId)

  return (
    <div className="space-y-5 max-w-screen-2xl">
      <div>
        <h1 className="text-[28px] leading-tight font-extrabold text-[#0F172A]">Berkas Backup</h1>
        <p className="text-sm text-[#475569] mt-1">
          {r ? `Retensi ${r.retensi_hari} hari, berkas lebih tua terhapus otomatis` : 'Unduh berkas backup semua node'}
        </p>
      </div>

      {r && (
        <div className="grid grid-cols-3 xl:grid-cols-[1fr_1fr_1fr_1.4fr] gap-3 md:gap-5 berurutan">
          {(['rsc', 'backup', 'sql'] as const).map((j, i) => (
            <section
              key={j}
              className={cn(
                'rounded-[20px] p-4 md:p-5 flex flex-col gap-2',
                i === 0 ? 'bg-[#4255F0] text-white shadow-[0_12px_24px_-12px_#4255F0CC]' : 'bg-white',
              )}
            >
              <span className={cn('text-xs md:text-[13px] font-semibold', i === 0 ? 'text-white' : 'text-[#334155]')}>
                {JENIS[j].label}<span className="hidden sm:inline">, {j === 'rsc' ? 'export teks' : j === 'backup' ? 'biner' : 'database'}</span>
              </span>
              <span className="text-2xl md:text-[30px] leading-none font-extrabold tracking-tight"><Hitung n={r.jenis[j].jumlah} /></span>
              <span className={cn('text-xs md:text-[13px]', i === 0 ? 'text-[#E6E9FF]' : 'text-[#475569]')}>
                <span className="hidden sm:inline">berkas · </span>{ukuran(r.jenis[j].byte)}
              </span>
            </section>
          ))}
          {disk && (
            <section className="card p-4 md:p-5 flex flex-col gap-3 col-span-3 xl:col-span-1">
              <div className="flex justify-between items-baseline gap-2">
                <span className="text-[13px] font-semibold text-[#334155]">Disk server backup</span>
                <span className="text-[13px] text-[#475569]">{ukuran(disk.total)}</span>
              </div>
              <span className="text-[30px] leading-none font-extrabold tracking-tight">
                <Hitung n={Math.round((terpakai / disk.total) * 100)} />%{' '}
                <span className="text-sm font-semibold text-[#475569]">terpakai</span>
              </span>
              <div
                role="img"
                aria-label={`Disk terpakai ${Math.round((terpakai / disk.total) * 100)} persen`}
                className="flex h-2.5 rounded-full overflow-hidden bg-[#EEF0F6]"
              >
                {(['rsc', 'backup', 'sql'] as const).map((j) => (
                  <span key={j} className="animate-tumbuh" style={{ width: `${(r.jenis[j].byte / disk.total) * 100}%`, background: JENIS[j].warna }} />
                ))}
                {/* Sisa pemakaian partisi di luar berkas backup (sistem, log, dll). */}
                <span className="animate-tumbuh" style={{
                  width: `${(Math.max(0, terpakai - r.jenis.rsc.byte - r.jenis.backup.byte - r.jenis.sql.byte) / disk.total) * 100}%`,
                  background: '#C9CCD8',
                }} />
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-[#475569]">
                {(['rsc', 'backup', 'sql'] as const).map((j) => (
                  <span key={j} className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full" style={{ background: JENIS[j].warna }} />{JENIS[j].label}
                  </span>
                ))}
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#C9CCD8]" />lainnya</span>
              </div>
            </section>
          )}
        </div>
      )}

      <section className="card p-3 md:p-4 flex flex-wrap items-center gap-3">
        <label className="relative flex-[1_1_240px]">
          <span className="sr-only">Cari berkas</span>
          <Search className="w-[18px] h-[18px] text-[#475569] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={ketik}
            onChange={(e) => setKetik(e.target.value)}
            placeholder="Cari nama berkas atau node"
            className="kotak-cari"
          />
        </label>
        <div className="flex gap-2 overflow-x-auto -mx-1 px-1 max-w-full">
          {(['', 'rsc', 'backup', 'sql'] as const).map((j) => (
            <button key={j || 'semua'} type="button" aria-pressed={jenis === j} onClick={() => atur({ jenis: j })} className="chip">
              {j ? JENIS[j].label : 'Semua'}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-[13px] font-semibold text-[#475569]">
          Node
          <select value={nodeId} onChange={(e) => atur({ node: e.target.value })} className="pilih max-w-[180px]">
            <option value="">Semua node</option>
            {(nodesData?.data ?? []).map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 text-[13px] font-semibold text-[#475569]">
          Urutkan
          <select value={urut} onChange={(e) => atur({ urut: e.target.value === 'terbaru' ? '' : e.target.value })} className="pilih">
            {URUT.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>
      </section>

      {isLoading && (
        <div className="card p-8 text-center text-[#475569] text-sm animate-pulse">Memuat...</div>
      )}

      {!isLoading && files.length === 0 && (
        <div className="card p-14 text-center">
          <HardDrive className="w-12 h-12 text-[#CBD5E1] mx-auto mb-4" />
          {adaSaringan ? (
            <>
              <p className="text-[#334155] font-semibold">Tidak ada berkas yang cocok.</p>
              <button
                onClick={() => { setKetik(''); setSp({}, { replace: true }) }}
                className="mt-3 min-h-[44px] px-4 rounded-[14px] border border-[#DADDE8] bg-white text-sm font-semibold hover:bg-[#F4F5FA]"
              >
                Hapus saringan
              </button>
            </>
          ) : (
            <>
              <p className="text-[#334155] font-semibold">Belum ada berkas backup.</p>
              <p className="text-[#475569] text-sm mt-1">Berkas muncul di sini setelah backup pertama berjalan.</p>
            </>
          )}
        </div>
      )}

      {files.length > 0 && (
        <>
          {/* HP: kartu */}
          <div className={cn('space-y-3 md:hidden berurutan transition-opacity', isFetching && 'opacity-60')}>
            {files.map((file) => {
              const j = jenisDari(file.filename)
              return (
                <div key={`${file.node_name}-${file.filename}`} className="card p-4 space-y-2.5">
                  <p className="text-[13px] font-mono font-medium text-[#0F172A] break-words">{file.filename}</p>
                  <div className="flex items-center gap-2 flex-wrap text-xs text-[#475569]">
                    <span className={cn('pill', JENIS[j].gaya)}>{JENIS[j].label}</span>
                    <span className="font-semibold text-[#334155]">{file.node_name}</span>
                    <span>{ukuran(file.size)}</span>
                    <span>{kapan(file.created_at)}</span>
                  </div>
                  <Aksi file={file} />
                </div>
              )
            })}
          </div>

          {/* Desktop: tabel */}
          <div className={cn('card hidden md:block overflow-x-auto px-2 pb-2 transition-opacity', isFetching && 'opacity-60')}>
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="th">Berkas</th>
                  <th className="th">Node</th>
                  <th className="th">Tipe</th>
                  <th className="th !text-right">Ukuran</th>
                  <th className="th">Waktu</th>
                  <th className="th"><span className="sr-only">Aksi</span></th>
                </tr>
              </thead>
              <tbody>
                {files.map((file) => {
                  const j = jenisDari(file.filename)
                  return (
                    <tr key={`${file.node_name}-${file.filename}`} className="border-t border-[#EEF0F6] hover:bg-[#F8F9FC] transition-colors">
                      <td className="px-3 py-3 font-mono text-[12.5px] text-[#0F172A] break-words">{file.filename}</td>
                      <td className="px-3 py-3 font-semibold whitespace-nowrap">
                        {file.node_id ? (
                          <Link to={`/devices/${file.node_id}`} className="hover:text-[#3442D9] hover:underline">{file.node_name}</Link>
                        ) : file.node_name}
                      </td>
                      <td className="px-3 py-3"><span className={cn('pill', JENIS[j].gaya)}>{JENIS[j].label}</span></td>
                      <td className="px-3 py-3 text-right whitespace-nowrap">{ukuran(file.size)}</td>
                      <td className="px-3 py-3 text-[#475569] whitespace-nowrap">{kapan(file.created_at)}</td>
                      <td className="px-2 py-2"><Aksi file={file} /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {meta && meta.last_page > 1 && (
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-[#475569]">
                {(meta.current_page - 1) * meta.per_page + 1}–
                {Math.min(meta.current_page * meta.per_page, meta.total)} dari {meta.total.toLocaleString('id-ID')} berkas
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => atur({ page: String(Math.max(1, meta.current_page - 1)) })}
                  disabled={meta.current_page === 1}
                  aria-label="Halaman sebelumnya"
                  className="w-11 h-11 rounded-full bg-white border border-[#E2E4EC] text-[#334155] hover:bg-[#F1F2F7] flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-sm text-[#0F172A] font-semibold">
                  {meta.current_page} / {meta.last_page}
                </span>
                <button
                  onClick={() => atur({ page: String(Math.min(meta.last_page, meta.current_page + 1)) })}
                  disabled={meta.current_page === meta.last_page}
                  aria-label="Halaman berikutnya"
                  className="w-11 h-11 rounded-full bg-white border border-[#E2E4EC] text-[#334155] hover:bg-[#F1F2F7] flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
