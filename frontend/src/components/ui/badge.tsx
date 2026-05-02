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
  default: 'bg-slate-800 text-slate-300 border-slate-700',
  admin: 'bg-purple-900/50 text-purple-300 border-purple-800',
  operator: 'bg-blue-900/50 text-blue-300 border-blue-800',
  viewer: 'bg-slate-800 text-slate-400 border-slate-700',
  mikrotik: 'bg-orange-900/50 text-orange-300 border-orange-800',
  database: 'bg-teal-900/50 text-teal-300 border-teal-800',
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
        className
      )}
    >
      {children}
    </span>
  )
}
