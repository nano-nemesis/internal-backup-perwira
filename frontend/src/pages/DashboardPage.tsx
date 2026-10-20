import React, { useState, type ReactNode } from 'react'
import { Archive, XCircle, HelpCircle, Stethoscope, ChevronRight, type LucideIcon } from 'lucide-react'
import { VpsWidget } from '../components/dashboard/VpsWidget'
import { VpsMetricsChart } from '../components/charts/VpsMetricsChart'
import { NodeTable } from '../components/nodes/NodeTable'
import { NodeForm } from '../components/nodes/NodeForm'
import { useNodes } from '../hooks/useNodes'
import { Link } from 'react-router-dom'
import { hitungDoctor } from '../components/nodes/DoctorPanel'
import type { Node } from '../types'
import { cn } from '../lib/utils'
import { Hitung } from '../components/ui/hitung'

const tanggal = new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

function Angka({ icon: Icon, judul, nilai, ket, pill, hero }: {
  icon: LucideIcon
  judul: string
  nilai: ReactNode
  ket: string
  pill?: { teks: string; gaya: string }
  hero?: boolean
}) {
  return (
    <section
      className={cn(
        'rounded-[20px] p-5 flex flex-col gap-4',
        hero ? 'bg-[#4255F0] text-white shadow-[0_12px_24px_-12px_#4255F0CC]' : 'bg-white',
      )}
    >
      <div className="flex justify-between items-start gap-2">
        <span className={cn('w-11 h-11 rounded-xl flex items-center justify-center', hero ? 'bg-white text-[#4255F0]' : 'bg-[#F1F2F7] text-[#334155]')}>
          <Icon className="w-5 h-5" strokeWidth={1.8} />
        </span>
        {pill && <span className={cn('pill', pill.gaya)}>{pill.teks}</span>}
      </div>
      <div>
        <h2 className={cn('text-sm font-semibold', hero ? 'text-white' : 'text-[#334155]')}>{judul}</h2>
        <p className="mt-1.5 flex items-baseline gap-2 flex-wrap">
          <span className="text-[34px] leading-none font-extrabold tracking-tight">{nilai}</span>
          <span className={cn('text-[13px]', hero ? 'text-[#E6E9FF]' : 'text-[#475569]')}>{ket}</span>
        </p>
      </div>
    </section>
  )
}

/** Cincin konsentris 3/4 lingkaran, satu cincin per ukuran. */
function Cincin({ data }: { data: { label: string; nilai: number; total: number; warna: string }[] }) {
  return (
    <svg width="180" height="180" viewBox="0 0 220 220" role="img" className="flex-shrink-0"
      aria-label={data.map((d) => `${d.label} ${d.nilai} dari ${d.total}`).join(', ')}>
      {data.map((d, i) => {
        const r = 88 - i * 20
        const keliling = 2 * Math.PI * r
        const busur = keliling * 0.75
        const isi = d.total ? (busur * d.nilai) / d.total : 0
        return (
          <g key={d.label} transform="rotate(135 110 110)" fill="none" strokeWidth="13" strokeLinecap="round">
            <circle cx="110" cy="110" r={r} stroke="#E4E6EE" strokeDasharray={`${busur} ${keliling}`} />
            {isi > 0 && (
              <circle
                cx="110" cy="110" r={r} stroke={d.warna} strokeDasharray={`${isi} ${keliling}`}
                className="animate-cincin" style={{ '--isi': isi, animationDelay: `${i * 120}ms` } as React.CSSProperties}
              />
            )}
          </g>
        )
      })}
    </svg>
  )
}

export default function DashboardPage() {
  const { data, isLoading, isError, fetchStatus, refetch } = useNodes()
  // fetchStatus 'paused' = React Query menganggap browser offline dan MENUNDA request.
  // Dalam keadaan itu isError tetap false selamanya, jadi cek isError saja masih
  // menampilkan "0 node" ke teknisi yang sinyalnya putus — persis kebohongan yang
  // mau ditutup di sini.
  const loadFailed = isError || fetchStatus === 'paused'
  const [editingNode, setEditingNode] = useState<Node | null>(null)

  const stats = data?.stats ?? { total: 0, success: 0, failed: 0, unknown: 0 }
  const doctor = hitungDoctor(data?.data ?? [])
  const doctorTeratas = doctor.urut.filter((n) => n.doctor?.galat || n.doctor?.ringkasan?.kritis).slice(0, 3)

  const tanpaKritis = doctor.urut.length - doctor.kritis - doctor.belum
  const persen = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0)
  const lampu = [
    { label: 'Backup berhasil', nilai: stats.success, total: stats.total, warna: '#4255F0' },
    { label: 'Tanpa temuan kritis', nilai: Math.max(tanpaKritis, 0), total: doctor.urut.length, warna: '#F97316' },
  ]

  return (
    <div className="space-y-5 max-w-screen-2xl">
      {loadFailed && (
        <div role="alert" className="rounded-2xl bg-[#FEE2E2] px-4 py-3 text-sm text-[#991B1B] flex items-center justify-between gap-4">
          <span>
            Gagal memuat daftar node, angka di bawah mungkin tidak mencerminkan keadaan
            sebenarnya. Jangan simpulkan node hilang dari daftar kosong.
          </span>
          <button
            onClick={() => refetch()}
            className="px-4 rounded-xl bg-white font-semibold hover:bg-[#FEF2F2] whitespace-nowrap min-h-[44px]"
          >
            Coba lagi
          </button>
        </div>
      )}

      <div>
        <h1 className="text-[28px] font-extrabold">Dashboard Backup</h1>
        <p className="text-sm text-[#475569] mt-1">{tanggal.format(new Date())} · diperbarui otomatis</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)] gap-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 content-start berurutan">
          <Angka
            hero
            icon={Archive}
            judul="Backup berhasil"
            nilai={data ? <><Hitung n={stats.success} /> / <Hitung n={stats.total} /></> : '—'}
            ket="node, percobaan terakhir"
            pill={data && stats.total ? { teks: `${persen(stats.success, stats.total)}% sehat`, gaya: 'bg-[#BBF7D0] text-[#14532D]' } : undefined}
          />
          <Angka
            icon={XCircle}
            judul="Backup gagal"
            nilai={data ? <Hitung n={stats.failed} /> : '—'}
            ket="node, percobaan terakhir"
            pill={stats.failed ? { teks: 'perlu dicek', gaya: 'bg-[#DC2626] text-white' } : { teks: 'aman', gaya: 'bg-[#BBF7D0] text-[#14532D]' }}
          />
          <Angka
            icon={HelpCircle}
            judul="Belum ada hasil"
            nilai={data ? <Hitung n={stats.unknown} /> : '—'}
            ket="node belum pernah dibackup"
          />
          <Link to="/doctor" className="rounded-[20px] angkat focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4255F0]">
            <Angka
              icon={Stethoscope}
              judul="Doctor kritis"
              nilai={data ? <Hitung n={doctor.kritis} /> : '—'}
              ket={`dari ${doctor.urut.length} MikroTik`}
              pill={doctor.kritis ? { teks: 'lihat temuan', gaya: 'bg-[#FEE2E2] text-[#991B1B]' } : undefined}
            />
          </Link>
        </div>

        <section className="card p-5 md:p-6 flex flex-col gap-5">
          <div>
            <h2 className="text-lg font-bold">Kesehatan armada</h2>
            <p className="text-[13px] text-[#475569] mt-1">Backup dan konfigurasi tiap router</p>
          </div>
          <div className="flex items-center gap-5 flex-wrap">
            <Cincin data={lampu} />
            <div className="flex flex-col gap-1.5">
              <span className="text-[34px] leading-none font-extrabold">{data ? <Hitung n={stats.total} /> : '—'}</span>
              <span className="text-[13px] text-[#475569]">node dipantau</span>
              <span className="pill self-start bg-[#E0E3FF] text-[#2E3AC2]">{doctor.urut.length} MikroTik</span>
            </div>
          </div>
          <ul className="flex flex-col gap-3.5">
            {lampu.map((l) => (
              <li key={l.label} className="flex items-center gap-3 text-sm">
                <span className="w-3 h-3 rounded flex-shrink-0" style={{ background: l.warna }} />
                <span className="flex-1 font-semibold">{l.label}</span>
                <span className="font-bold">{l.nilai}/{l.total}</span>
                <span className={cn('pill', persen(l.nilai, l.total) >= 80 ? 'bg-[#BBF7D0] text-[#14532D]' : 'bg-[#FEE2E2] text-[#991B1B]')}>
                  {persen(l.nilai, l.total)}%
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {doctorTeratas.length > 0 && (
        <section className="card p-5 md:p-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-lg font-bold">Perlu tindakan</h2>
              <p className="text-[13px] text-[#475569] mt-1">
                Temuan Doctor paling berat, diperbarui tiap backup
              </p>
            </div>
            <div className="flex gap-2 flex-wrap">
              <span className="pill bg-[#DC2626] text-white">{doctor.kritis} kritis</span>
              <span className="pill bg-[#FEF3C7] text-[#92400E]">{doctor.perhatian} perhatian</span>
              <span className="pill bg-[#BBF7D0] text-[#14532D]">{doctor.sehat} sesuai</span>
              {doctor.belum > 0 && <span className="pill bg-[#E5E7EB] text-[#374151]">{doctor.belum} belum diperiksa</span>}
            </div>
          </div>
          <ul className="mt-3 divide-y divide-[#EEF0F6]">
            {doctorTeratas.map((n) => (
              <li key={n.id}>
                <Link
                  to={`/devices/${n.id}?tab=doctor`}
                  className="flex items-center gap-3 py-3 min-h-[56px] group -mx-2 px-2 rounded-xl hover:bg-[#F8F9FC] transition-colors"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold text-sm">{n.name}</span>
                    <span className="block text-[13px] text-[#475569] break-words">
                      {n.doctor?.galat ? 'Tidak bisa diperiksa' : n.doctor?.utama}
                    </span>
                  </span>
                  {!!n.doctor?.ringkasan?.kritis && (
                    <span className="pill bg-[#DC2626] text-white">{n.doctor.ringkasan.kritis} kritis</span>
                  )}
                  <ChevronRight className="w-4 h-4 text-[#94A3B8] group-hover:text-[#0F172A] group-hover:translate-x-0.5 transition-transform flex-shrink-0" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)] gap-5">
        <section className="card p-5 md:p-6 min-w-0">
          <h2 className="text-lg font-bold">CPU &amp; RAM server backup</h2>
          <p className="text-[13px] text-[#475569] mt-1 mb-4">Satu jam terakhir</p>
          <VpsMetricsChart />
        </section>
        <VpsWidget />
      </div>

      <section className="card overflow-hidden">
        <div className="px-5 md:px-6 py-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold">Semua node</h2>
          <span className="text-[13px] text-[#475569]">
            {data ? `${data.data.length} node` : 'jumlah node tidak diketahui'}
          </span>
        </div>
        {isLoading ? (
          <div className="p-8 text-center text-[#475569] text-sm animate-pulse">Memuat...</div>
        ) : data ? (
          <NodeTable nodes={data.data} onEdit={setEditingNode} />
        ) : (
          <div className="p-8 text-center text-[#475569] text-sm">
            Daftar node tidak bisa dimuat. Ini bukan berarti tidak ada node.
          </div>
        )}
      </section>

      <NodeForm
        open={!!editingNode}
        onClose={() => setEditingNode(null)}
        editingNode={editingNode}
      />
    </div>
  )
}
