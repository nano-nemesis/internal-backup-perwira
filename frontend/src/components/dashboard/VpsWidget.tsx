import { Cpu, HardDrive, Activity } from 'lucide-react'
import { useVpsMetrics } from '../../hooks/useVpsMetrics'

function MetricRow({
  icon: Icon,
  label,
  value,
  pct,
  barColor,
}: {
  icon: typeof Cpu
  label: string
  value: string
  pct: number
  barColor: string
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 text-[13px] font-semibold text-[#334155]">
        <Icon className="w-3.5 h-3.5 flex-shrink-0" />
        <span>{label}</span>
        <span className="ml-auto font-bold text-[#0F172A]">{value}</span>
      </div>
      <div className="w-full bg-[#F1F2F7] rounded-full h-2">
        <div
          className="h-2 rounded-full transition-all duration-500 animate-tumbuh"
          style={{ width: `${Math.min(100, pct)}%`, backgroundColor: barColor }}
        />
      </div>
    </div>
  )
}

export function VpsWidget() {
  const { data, isLoading } = useVpsMetrics()
  const latest = data?.latest

  if (isLoading) {
    return <div className="card p-5 h-64 animate-pulse" />
  }

  if (!latest) {
    return (
      <div className="card p-5 text-[#475569] text-sm">
        Belum ada metrik server. Pengumpul berjalan tiap menit.
      </div>
    )
  }

  const memPct = (latest.memory_used_mb / latest.memory_total_mb) * 100
  const diskPct = (latest.disk_used_gb / latest.disk_total_gb) * 100

  const cpuColor = latest.cpu_usage_percent > 80 ? '#DC2626' : '#4255F0'
  const memColor = memPct > 80 ? '#DC2626' : '#D97706'
  const diskColor = diskPct > 80 ? '#DC2626' : '#16A34A'

  return (
    <section className="card p-5 md:p-6">
      <div className="flex items-start justify-between gap-3 mb-5">
        <div>
          <h2 className="text-lg font-bold">Server backup</h2>
          <p className="text-[13px] text-[#475569] mt-1">Pemakaian sumber daya saat ini</p>
        </div>
        <span className="pill bg-[#F1F2F7] text-[#334155]">
          {new Date(latest.recorded_at).toLocaleTimeString('id-ID')}
        </span>
      </div>
      <div className="grid grid-cols-1 gap-y-5">
        <MetricRow
          icon={Cpu}
          label="CPU"
          value={`${latest.cpu_usage_percent.toFixed(1)}%`}
          pct={latest.cpu_usage_percent}
          barColor={cpuColor}
        />
        <MetricRow
          icon={Cpu}
          label={`RAM ${latest.memory_used_mb}/${latest.memory_total_mb} MB`}
          value={`${memPct.toFixed(1)}%`}
          pct={memPct}
          barColor={memColor}
        />
        <MetricRow
          icon={HardDrive}
          label={`Disk ${latest.disk_used_gb.toFixed(1)}/${latest.disk_total_gb.toFixed(1)} GB`}
          value={`${diskPct.toFixed(1)}%`}
          pct={diskPct}
          barColor={diskColor}
        />
        <MetricRow
          icon={Activity}
          label="Load Avg"
          value={latest.load_average.toFixed(2)}
          pct={(latest.load_average / 4) * 100}
          barColor="#7C3AED"
        />
      </div>
    </section>
  )
}
