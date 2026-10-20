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
    return <div className="h-48 animate-pulse bg-[#F1F2F7] rounded" />
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
      <div className="flex items-center justify-center h-48 text-[#475569] text-sm font-mono">
        No data yet
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="4 4" stroke="#ECEEF4" vertical={false} />
        <XAxis
          dataKey="time"
          tick={{ fill: '#475569', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fill: '#475569', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          domain={[0, 100]}
          unit="%"
        />
        <Tooltip
          contentStyle={{
            backgroundColor: '#111827',
            border: 'none',
            borderRadius: '12px',
            fontSize: '12px',
          }}
          itemStyle={{ color: '#FFFFFF' }}
          labelStyle={{ color: '#CBD5E1' }}
          cursor={{ stroke: '#C9CCD8', strokeDasharray: '4 4' }}
        />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '12px', color: '#334155' }} />
        <Line
          type="monotone"
          dataKey="CPU"
          stroke="#4255F0"
          dot={false}
          strokeWidth={2.5}
        />
        <Line
          type="monotone"
          dataKey="RAM"
          stroke="#F97316"
          dot={false}
          strokeWidth={2.5}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
