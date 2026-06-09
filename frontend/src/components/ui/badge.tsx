import React from 'react'
import { cn } from '../../lib/utils'
import type { BackupStatus } from '../../types'

export function StatusBadge({ status }: { status: BackupStatus | undefined | null }) {
  if (!status) return <span className="badge-unknown">Unknown</span>

  const map: Record<BackupStatus, string> = {
    success: 'badge-success',
    failed: 'badge-failed',
    pending: 'badge-pending',
    running: 'badge-running',
  }

  return <span className={map[status] ?? 'badge-unknown'}>{status}</span>
}

const variantStyles: Record<string, string> = {
  default: 'bg-[#F8FAFC] text-[#64748B] border-[#E2E8F0]',
  admin: 'bg-purple-50 text-purple-700 border-purple-200',
  operator: 'bg-[#EFF6FF] text-[#0077FF] border-[#BFDBFE]',
  viewer: 'bg-[#F8FAFC] text-[#64748B] border-[#E2E8F0]',
  mikrotik: 'bg-[#FFF7ED] text-[#FF8C00] border-orange-200',
  database: 'bg-teal-50 text-teal-700 border-teal-200',
  virtualizor_db: 'bg-indigo-50 text-indigo-700 border-indigo-200',
}

export function Badge({
  children,
  variant = 'default',
  className,
}: {
  children: React.ReactNode
  variant?: string
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border',
        variantStyles[variant] ?? variantStyles.default,
        className,
      )}
    >
      {children}
    </span>
  )
}
