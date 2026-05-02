import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from 'recharts'
import { useVpsMetrics } from '../../hooks/useVpsMetrics'

export function VpsMetricsChart() {
  const { data, isLoading } = useVpsMetrics()

  if (isLoading) {
    return <div className="h-48 animate-pulse bg-slate-800 rounded" />
  }

  const chartData = (data?.data ?? []).map((m) => ({
    time: new Date(m.recorded_at).toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
    }),
    CPU: parseFloat(m.cpu_usage_percent.toFixed(1)),
    RAM: parseFloat(
      ((m.memory_used_mb / m.memory_total_mb) * 100).toFixed(1)
    ),
  }))

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-slate-500 text-sm font-mono">
        No data yet
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
        <XAxis
          dataKey="time"
          tick={{ fill: '#64748b', fontSize: 10, fontFamily: 'monospace' }}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fill: '#64748b', fontSize: 10 }}
          domain={[0, 100]}
          unit="%"
        />
        <Tooltip
          contentStyle={{
            backgroundColor: '#1e293b',
            border: '1px solid #334155',
            borderRadius: '8px',
            color: '#e2e8f0',
            fontSize: '11px',
            fontFamily: 'monospace',
          }}
        />
        <Legend wrapperStyle={{ fontSize: '11px', color: '#94a3b8' }} />
        <Line
          type="monotone"
          dataKey="CPU"
          stroke="#3b82f6"
          dot={false}
          strokeWidth={1.5}
        />
        <Line
          type="monotone"
          dataKey="RAM"
          stroke="#10b981"
          dot={false}
          strokeWidth={1.5}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
