import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Info, AlertTriangle, XCircle, ChevronLeft, ChevronRight, ChevronDown, ScrollText, Search } from 'lucide-react'
import { useActivityLogs } from '../hooks/useActivityLogs'
import { useNodes } from '../hooks/useNodes'
import { useAuth } from '../context/AuthContext'
import { cn } from '../lib/utils'
import type { ActivityLogItem, LogLevel } from '../types'

const KATEGORI: Record<string, string> = {
  auth: 'Login',
  backup: 'Backup',
  node: 'Node',
  user: 'User',
  terminal: 'Terminal',
  berkas: 'Unduhan',
  pengaturan: 'Pengaturan',
  sistem: 'Sistem',
}

const LEVEL: Record<LogLevel, { label: string; icon: typeof Info; warna: string; garis: string }> = {
  error: { label: 'Error', icon: XCircle, warna: 'text-[#991B1B] bg-[#FEE2E2]', garis: '' },
  warning: { label: 'Peringatan', icon: AlertTriangle, warna: 'text-[#92400E] bg-[#FEF3C7]', garis: '' },
  info: { label: 'Info', icon: Info, warna: 'text-[#2E3AC2] bg-[#E0E3FF]', garis: '' },
}

const inputCls =
  'px-3.5 min-h-[44px] bg-white border border-[#DADDE8] rounded-xl text-sm text-[#0F172A] focus:outline-none focus:border-[#4255F0] focus:ring-4 focus:ring-[#4255F0]/15'

function waktuWIB(iso: string) {
  return new Date(iso).toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }) + ' WIB'
}

function NilaiKonteks({ nilai }: { nilai: unknown }) {
  if (nilai === null || nilai === undefined || nilai === '') return <span className="text-[#94A3B8]">—</span>
  if (typeof nilai === 'string' && !nilai.includes('\n')) return <span className="break-all">{nilai}</span>
  return (
    <pre className="whitespace-pre-wrap break-all text-xs font-mono bg-[#F4F5FA] rounded-xl p-3 max-h-64 overflow-auto">
      {typeof nilai === 'string' ? nilai : JSON.stringify(nilai, null, 2)}
    </pre>
  )
}

function BarisLog({ log }: { log: ActivityLogItem }) {
  const [buka, setBuka] = useState(false)
  const lv = LEVEL[log.level] ?? LEVEL.info
  const Ikon = lv.icon
  const konteks = Object.entries(log.konteks ?? {})

  return (
    <li className="card overflow-hidden">
      <button
        onClick={() => setBuka((b) => !b)}
        aria-expanded={buka}
        className="w-full text-left p-4 md:px-5 flex gap-3.5 items-start hover:bg-[#F8F9FC] transition-colors"
      >
        <span className={cn('w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0', lv.warna)}>
          <Ikon className="w-[18px] h-[18px]" strokeWidth={1.8} aria-label={lv.label} />
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#475569]">
            <span className="tabular-nums">{waktuWIB(log.created_at)}</span>
            <span className={cn('pill', lv.warna)}>{lv.label}</span>
            <span className="pill bg-[#F1F2F7] text-[#334155]">
              {KATEGORI[log.kategori] ?? log.kategori}
            </span>
          </div>
          <p className="text-sm font-semibold text-[#0F172A] mt-1 break-words">{log.pesan}</p>
          <p className="text-xs text-[#475569] mt-1 flex flex-wrap gap-x-3">
            {log.username && <span>👤 {log.username}</span>}
            {log.ip && <span>🌐 {log.ip}</span>}
            {log.node_name && <span>🖧 {log.node_name}</span>}
            {!log.username && !log.ip && <span>sistem / otomatis</span>}
          </p>
        </div>
        <ChevronDown className={cn('w-4 h-4 text-[#94A3B8] flex-shrink-0 transition-transform', buka && 'rotate-180')} />
      </button>

      {buka && (
        <dl className="px-4 md:px-5 pb-4 pt-3 md:ml-[50px] grid grid-cols-1 sm:grid-cols-[140px_1fr] gap-x-4 gap-y-2 text-sm border-t border-[#EEF0F6]">
          <dt className="text-[#475569] text-xs pt-0.5">Kode kejadian</dt>
          <dd className="font-mono text-xs pt-0.5">{log.kategori}.{log.aksi} · #{log.id}</dd>
          {konteks.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-[#475569] text-xs pt-0.5">{k.replace(/_/g, ' ')}</dt>
              <dd className="text-xs text-[#0F172A] min-w-0"><NilaiKonteks nilai={v} /></dd>
            </div>
          ))}
        </dl>
      )}
    </li>
  )
}

export default function LogSistemPage() {
  const { isAdmin } = useAuth()
  const [ketik, setKetik] = useState('')
  const [q, setQ] = useState('')
  const [level, setLevel] = useState('')
  const [kategori, setKategori] = useState('')
  const [nodeId, setNodeId] = useState('')
  const [dari, setDari] = useState('')
  const [sampai, setSampai] = useState('')
  const [page, setPage] = useState(1)

  // Cari setelah berhenti mengetik, bukan tiap huruf.
  useEffect(() => {
    const t = setTimeout(() => { setQ(ketik.trim()); setPage(1) }, 400)
    return () => clearTimeout(t)
  }, [ketik])

  const { data, isLoading, isError } = useActivityLogs({ q, level, kategori, node_id: nodeId, dari, sampai, page })
  const { data: nodesData } = useNodes()

  if (!isAdmin) return <Navigate to="/dashboard" replace />

  const logs = data?.data ?? []
  const meta = data?.meta
  const ringkasan = data?.ringkasan ?? {}
  const ubah = (setter: (v: string) => void) => (v: string) => { setter(v); setPage(1) }

  return (
    <div className="space-y-5 max-w-screen-2xl">
      <div>
        <h1 className="text-[28px] leading-tight font-extrabold text-[#0F172A]">Log Sistem</h1>
        <p className="text-sm text-[#475569] mt-1">
          Semua kejadian: login, backup, perubahan node &amp; user, terminal, unduhan, dan error. Ketuk baris untuk detail.
        </p>
      </div>

      {/* Ringkasan 24 jam — klik untuk memfilter */}
      <div className="grid grid-cols-3 gap-3 md:gap-5">
        {(['error', 'warning', 'info'] as const).map((lv) => {
          const L = LEVEL[lv]
          return (
            <button
              key={lv}
              onClick={() => ubah(setLevel)(level === lv ? '' : lv)}
              aria-pressed={level === lv}
              className={cn('card p-4 text-left transition-shadow hover:shadow-md', level === lv && 'ring-2 ring-[#4255F0]')}
            >
              <p className="text-[13px] font-semibold text-[#334155] flex items-center gap-1.5 flex-wrap">
                {L.label} <span className="font-normal text-[#475569]">24 jam</span>
              </p>
              <p className="text-[30px] leading-none font-extrabold text-[#0F172A] mt-2">{ringkasan[lv] ?? 0}</p>
            </button>
          )
        })}
      </div>

      {/* Filter */}
      <div className="card p-3 md:p-4 grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-6">
        <label className="relative lg:col-span-2">
          <span className="sr-only">Cari</span>
          <Search className="w-4 h-4 text-[#475569] absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            value={ketik}
            onChange={(e) => setKetik(e.target.value)}
            placeholder="Cari pesan, user, IP, node…"
            className={cn(inputCls, 'w-full pl-10')}
          />
        </label>
        <select aria-label="Kategori" value={kategori} onChange={(e) => ubah(setKategori)(e.target.value)} className={inputCls}>
          <option value="">Semua kategori</option>
          {Object.entries(KATEGORI).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <select aria-label="Node" value={nodeId} onChange={(e) => ubah(setNodeId)(e.target.value)} className={inputCls}>
          <option value="">Semua node</option>
          {(nodesData?.data ?? []).map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
        </select>
        <label className="flex items-center gap-2 text-xs text-[#475569]">
          Dari
          <input type="date" value={dari} onChange={(e) => ubah(setDari)(e.target.value)} className={cn(inputCls, 'flex-1 min-w-0')} />
        </label>
        <label className="flex items-center gap-2 text-xs text-[#475569]">
          Sampai
          <input type="date" value={sampai} onChange={(e) => ubah(setSampai)(e.target.value)} className={cn(inputCls, 'flex-1 min-w-0')} />
        </label>
      </div>

      {isLoading && <div className="card p-8 text-center text-[#475569] text-sm animate-pulse">Memuat log…</div>}
      {isError && <div className="card p-8 text-center text-[#991B1B] text-sm">Gagal memuat log. Coba muat ulang halaman.</div>}

      {!isLoading && !isError && logs.length === 0 && (
        <div className="card p-16 text-center">
          <ScrollText className="w-12 h-12 text-[#CBD5E1] mx-auto mb-4" />
          <p className="text-[#475569] font-medium">Tidak ada log yang cocok dengan filter.</p>
        </div>
      )}

      {logs.length > 0 && (
        <ul className="space-y-2">
          {logs.map((log) => <BarisLog key={log.id} log={log} />)}
        </ul>
      )}

      {meta && meta.last_page > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-[#475569]">{meta.total.toLocaleString('id-ID')} kejadian</p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={meta.current_page === 1}
              aria-label="Halaman sebelumnya"
              className="w-11 h-11 rounded-full bg-white border border-[#E2E4EC] text-[#334155] hover:bg-[#F1F2F7] flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm text-[#0F172A] font-medium tabular-nums">{meta.current_page} / {meta.last_page}</span>
            <button
              onClick={() => setPage((p) => Math.min(meta.last_page, p + 1))}
              disabled={meta.current_page === meta.last_page}
              aria-label="Halaman berikutnya"
              className="w-11 h-11 rounded-full bg-white border border-[#E2E4EC] text-[#334155] hover:bg-[#F1F2F7] flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
