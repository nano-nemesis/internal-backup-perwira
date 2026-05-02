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
        <h1 className="text-2xl font-mono font-bold text-white">Dashboard</h1>
        <p className="text-sm text-slate-500 mt-1">
          Backup system overview · auto-refreshes every 30s
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Nodes"
          value={stats.total}
          icon={Server}
          color="text-blue-400"
        />
        <StatCard
          title="Success"
          value={stats.success}
          icon={CheckCircle}
          color="text-emerald-400"
        />
        <StatCard
          title="Failed"
          value={stats.failed}
          icon={XCircle}
          color="text-red-400"
        />
        <StatCard
          title="Unknown"
          value={stats.unknown}
          icon={HelpCircle}
          color="text-slate-400"
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card p-5">
          <h3 className="text-sm font-mono text-slate-400 mb-3">
            Backup Status
          </h3>
          <StatusPieChart stats={stats} />
        </div>
        <div className="card p-5 lg:col-span-2">
          <h3 className="text-sm font-mono text-slate-400 mb-3">
            CPU &amp; RAM — Last Hour
          </h3>
          <VpsMetricsChart />
        </div>
      </div>

      {/* VPS Widget */}
      <VpsWidget />

      {/* Nodes Table */}
      <div className="card">
        <div className="px-5 py-4 border-b border-slate-700 flex items-center justify-between">
          <h3 className="text-sm font-mono text-slate-300 font-semibold">
            Nodes Overview
          </h3>
          <span className="text-xs text-slate-500 font-mono">
            {data?.data?.length ?? 0} nodes
          </span>
        </div>
        {isLoading ? (
          <div className="p-8 text-center text-slate-500 font-mono text-sm animate-pulse">
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
