import { useState } from 'react'
import { Server, CheckCircle, XCircle, HelpCircle } from 'lucide-react'
import { StatCard } from '../components/dashboard/StatCard'
import { VpsWidget } from '../components/dashboard/VpsWidget'
import { StatusPieChart } from '../components/charts/StatusPieChart'
import { VpsMetricsChart } from '../components/charts/VpsMetricsChart'
import { NodeTable } from '../components/nodes/NodeTable'
import { NodeForm } from '../components/nodes/NodeForm'
import { useNodes } from '../hooks/useNodes'
import { Link } from 'react-router-dom'
import { hitungDoctor } from '../components/nodes/DoctorPanel'
import type { Node } from '../types'

export default function DashboardPage() {
  const { data, isLoading, isError, fetchStatus, refetch } = useNodes()
  // fetchStatus 'paused' = React Query menganggap browser offline dan MENUNDA request.
  // Dalam keadaan itu isError tetap false selamanya, jadi cek isError saja masih
  // menampilkan "0 node" ke teknisi yang sinyalnya putus — persis kebohongan yang
  // mau ditutup di sini.
  const loadFailed = isError || fetchStatus === 'paused'
  const [editingNode, setEditingNode] = useState<Node | null>(null)

  const stats = data?.stats ?? { total: 0, success: 0, failed: 0, unknown: 0 }
  const statValue = (n: number) => (data ? n : '—')
  const doctor = hitungDoctor(data?.data ?? [])
  const doctorTeratas = doctor.urut.filter((n) => n.doctor?.galat || n.doctor?.ringkasan?.kritis).slice(0, 3)

  return (
    <div className="space-y-6 max-w-screen-xl">
      {loadFailed && (
        <div className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 flex items-center justify-between gap-4">
          <span>
            Gagal memuat daftar node — angka di bawah mungkin tidak mencerminkan keadaan
            sebenarnya. Jangan simpulkan node hilang dari daftar kosong.
          </span>
          <button
            onClick={() => refetch()}
            className="px-3 py-1.5 rounded-md border border-red-300 hover:bg-red-100 whitespace-nowrap min-h-[44px]"
          >
            Coba lagi
          </button>
        </div>
      )}

      <div>
        <h1 className="text-2xl font-display font-bold text-[#0F172A]">Dashboard</h1>
        <p className="text-sm text-[#475569] mt-1">
          Backup system overview · auto-refreshes every 30s
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          title="Total Nodes"
          value={statValue(stats.total)}
          icon={Server}
          iconColor="#0077FF"
          iconBg="#EFF6FF"
        />
        <StatCard
          title="Success"
          value={statValue(stats.success)}
          icon={CheckCircle}
          iconColor="#16A34A"
          iconBg="#F0FDF4"
        />
        <StatCard
          title="Failed"
          value={statValue(stats.failed)}
          icon={XCircle}
          iconColor="#E63000"
          iconBg="#FEF2F0"
        />
        <StatCard
          title="Unknown"
          value={statValue(stats.unknown)}
          icon={HelpCircle}
          iconColor="#475569"
          iconBg="#F8FAFC"
        />
      </div>

      {/* Doctor: kesehatan konfigurasi router, di dashboard yang sama dengan backup */}
      {doctor.urut.length > 0 && (
        <Link to="/doctor" className="card p-5 block hover:border-[#0077FF] transition-colors">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h3 className="text-sm font-display font-semibold text-[#0F172A]">Doctor konfigurasi MikroTik</h3>
              <p className="text-xs text-[#475569] mt-0.5">
                Standar keamanan, lisensi CHR, PPPoE, dan VPN — diperbarui tiap backup
              </p>
            </div>
            <div className="flex gap-4 text-sm flex-wrap">
              <span className="text-[#DC2626]"><span className="font-mono font-semibold">{doctor.kritis}</span> kritis</span>
              <span className="text-amber-600"><span className="font-mono font-semibold">{doctor.perhatian}</span> perhatian</span>
              <span className="text-[#16A34A]"><span className="font-mono font-semibold">{doctor.sehat}</span> sesuai</span>
              {doctor.belum > 0 && (
                <span className="text-[#475569]"><span className="font-mono font-semibold">{doctor.belum}</span> belum diperiksa</span>
              )}
            </div>
          </div>
          {doctorTeratas.length > 0 && (
            <ul className="mt-3 space-y-1 text-sm">
              {doctorTeratas.map((n) => (
                <li key={n.id} className="text-[#475569] break-words">
                  <span className="font-medium text-[#0F172A]">{n.name}</span> —{' '}
                  {n.doctor?.galat ? 'tidak bisa diperiksa' : n.doctor?.utama}
                </li>
              ))}
            </ul>
          )}
        </Link>
      )}

      {/* Charts row */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="card p-5 md:w-80 flex-shrink-0">
          <h3 className="text-sm font-display font-semibold text-[#0F172A] mb-3">
            Backup Status
          </h3>
          <StatusPieChart stats={stats} />
        </div>
        <div className="card p-5 flex-1 min-w-0">
          <h3 className="text-sm font-display font-semibold text-[#0F172A] mb-3">
            CPU &amp; RAM — Last Hour
          </h3>
          <VpsMetricsChart />
        </div>
      </div>

      {/* VPS Widget */}
      <VpsWidget />

      {/* Nodes Table */}
      <div className="card">
        <div className="px-5 py-4 border-b border-[#E2E8F0] flex items-center justify-between">
          <h3 className="text-sm font-display font-semibold text-[#0F172A]">
            Nodes Overview
          </h3>
          <span className="text-xs text-[#475569]">
            {data ? `${data.data.length} nodes` : 'jumlah node tidak diketahui'}
          </span>
        </div>
        {isLoading ? (
          <div className="p-8 text-center text-[#475569] text-sm animate-pulse">
            Loading...
          </div>
        ) : data ? (
          <NodeTable nodes={data.data} onEdit={setEditingNode} />
        ) : (
          <div className="p-8 text-center text-[#475569] text-sm">
            Daftar node tidak bisa dimuat. Ini bukan berarti tidak ada node.
          </div>
        )}
      </div>

      <NodeForm
        open={!!editingNode}
        onClose={() => setEditingNode(null)}
        editingNode={editingNode}
      />
    </div>
  )
}
