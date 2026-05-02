import { Cpu, HardDrive, Activity } from 'lucide-react'
import { useVpsMetrics } from '../../hooks/useVpsMetrics'

function MetricRow({
  icon: Icon,
  label,
  value,
  pct,
  color,
}: {
  icon: typeof Cpu
  label: string
  value: string
  pct: number
  color: string
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 text-xs text-slate-400">
        <Icon className="w-3.5 h-3.5 flex-shrink-0" />
        <span>{label}</span>
        <span className="ml-auto font-mono text-white">{value}</span>
      </div>
      <div className="w-full bg-slate-700 rounded-full h-1.5">
        <div
          className={`h-1.5 rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
    </div>
  )
}

export function VpsWidget() {
  const { data, isLoading } = useVpsMetrics()
  const latest = data?.latest

  if (isLoading) {
    return <div className="card p-5 h-40 animate-pulse" />
  }

  if (!latest) {
    return (
      <div className="card p-5 text-slate-500 text-sm font-mono">
        No VPS metrics available yet. Collector runs every minute.
      </div>
    )
  }

  const memPct = (latest.memory_used_mb / latest.memory_total_mb) * 100
  const diskPct = (latest.disk_used_gb / latest.disk_total_gb) * 100

  const cpuColor = latest.cpu_usage_percent > 80 ? 'bg-red-500' : 'bg-blue-500'
  const memColor = memPct > 80 ? 'bg-red-500' : 'bg-emerald-500'
  const diskColor = diskPct > 85 ? 'bg-red-500' : 'bg-yellow-500'

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-mono text-slate-400">VPS Monitor</h3>
        <span className="text-xs text-slate-600 font-mono">
          {new Date(latest.recorded_at).toLocaleTimeString('id-ID')}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-x-8 gap-y-4">
        <MetricRow
          icon={Cpu}
          label="CPU"
          value={`${latest.cpu_usage_percent.toFixed(1)}%`}
          pct={latest.cpu_usage_percent}
          color={cpuColor}
        />
        <MetricRow
          icon={Cpu}
          label={`RAM ${latest.memory_used_mb}/${latest.memory_total_mb} MB`}
          value={`${memPct.toFixed(1)}%`}
          pct={memPct}
          color={memColor}
        />
        <MetricRow
          icon={HardDrive}
          label={`Disk ${latest.disk_used_gb.toFixed(1)}/${latest.disk_total_gb.toFixed(1)} GB`}
          value={`${diskPct.toFixed(1)}%`}
          pct={diskPct}
          color={diskColor}
        />
        <MetricRow
          icon={Activity}
          label="Load Avg"
          value={latest.load_average.toFixed(2)}
          pct={(latest.load_average / 4) * 100}
          color="bg-purple-500"
        />
      </div>
    </div>
  )
}
