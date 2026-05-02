import { type LucideIcon } from 'lucide-react'

interface StatCardProps {
  title: string
  value: number | string
  icon: LucideIcon
  color?: string
  subtitle?: string
}

export function StatCard({
  title,
  value,
  icon: Icon,
  color = 'text-blue-400',
  subtitle,
}: StatCardProps) {
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-slate-500 font-mono uppercase tracking-wider">
            {title}
          </p>
          <p className={`text-3xl font-mono font-bold mt-1 ${color}`}>{value}</p>
          {subtitle && (
            <p className="text-xs text-slate-500 mt-1">{subtitle}</p>
          )}
        </div>
        <div className={`p-2 rounded-lg bg-slate-800/80 ${color}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </div>
  )
}
