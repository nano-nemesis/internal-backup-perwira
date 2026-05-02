import { useState } from 'react'
import { Server, CheckCircle, XCircle, HelpCircle } from 'lucide-react'
import { StatCard } from '../components/dashboard/StatCard'
import { VpsWidget } from '../components/dashboard/VpsWidget'
import { StatusPieChart } from '../components/charts/StatusPieChart'
import { VpsMetricsChart } from '../components/charts/VpsMetricsChart'
import { NodeTable } from '../components/nodes/NodeTable'
import { NodeForm } from '../components/nodes/NodeForm'
import { useNodes } from '../hooks/useNodes'
import type { Node } from '../types'

export default function DashboardPage() {
  const { data, isLoading } = useNodes()
  const [editingNode, setEditingNode] = useState<Node | null>(null)

  const stats = data?.stats ?? { total: 0, success: 0, failed: 0, unknown: 0 }

  return (
    <div className="space-y-6 max-w-screen-xl">
      <div>
        <h1 className="text-2xl font-display font-bold text-[#0F172A]">Dashboard</h1>
        <p className="text-sm text-[#64748B] mt-1">
          Backup system overview · auto-refreshes every 30s
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          title="Total Nodes"
          value={stats.total}
          icon={Server}
          iconColor="#0077FF"
          iconBg="#EFF6FF"
        />
        <StatCard
          title="Success"
          value={stats.success}
          icon={CheckCircle}
          iconColor="#16A34A"
          iconBg="#F0FDF4"
        />
        <StatCard
          title="Failed"
          value={stats.failed}
          icon={XCircle}
          iconColor="#E63000"
          iconBg="#FEF2F0"
        />
        <StatCard
          title="Unknown"
          value={stats.unknown}
          icon={HelpCircle}
          iconColor="#64748B"
          iconBg="#F8FAFC"
        />
      </div>

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
          <span className="text-xs text-[#64748B]">
            {data?.data?.length ?? 0} nodes
          </span>
        </div>
        {isLoading ? (
          <div className="p-8 text-center text-[#64748B] text-sm animate-pulse">
            Loading...
          </div>
        ) : (
          <NodeTable nodes={data?.data ?? []} onEdit={setEditingNode} />
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
