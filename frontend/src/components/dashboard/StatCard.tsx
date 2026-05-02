import { type LucideIcon } from 'lucide-react'

interface StatCardProps {
  title: string
  value: number | string
  icon: LucideIcon
  iconColor?: string
  iconBg?: string
  subtitle?: string
}

export function StatCard({
  title,
  value,
  icon: Icon,
  iconColor = '#0077FF',
  iconBg = '#EFF6FF',
  subtitle,
}: StatCardProps) {
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-[#64748B] uppercase tracking-wider">
            {title}
          </p>
          <p className="text-3xl font-display font-bold mt-1 text-[#0F172A]">{value}</p>
          {subtitle && (
            <p className="text-xs text-[#64748B] mt-1">{subtitle}</p>
          )}
        </div>
        <div
          className="p-2.5 rounded-lg flex-shrink-0"
          style={{ backgroundColor: iconBg }}
        >
          <Icon className="w-5 h-5" style={{ color: iconColor }} />
        </div>
      </div>
    </div>
  )
}
