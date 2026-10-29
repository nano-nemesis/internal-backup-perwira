import React from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '../../lib/utils'
import type { BackupStatus } from '../../types'

export function StatusBadge({ status }: { status: BackupStatus | undefined | null }) {
  if (!status) return <span className="badge-unknown">belum ada</span>

  // Backup berjalan di queue, jadi tanpa penanda bergerak layar terlihat diam
  // dan pengguna tidak tahu apakah proses sudah mulai.
  if (status === 'running' || status === 'pending') {
    return (
      <span className="badge-running animate-none gap-1" role="status" aria-live="polite">
        <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />
        {status === 'running' ? 'berjalan' : 'antre'}
      </span>
    )
  }

  const map: Record<BackupStatus, string> = {
    success: 'badge-success',
    failed: 'badge-failed',
    pending: 'badge-pending',
    running: 'badge-running',
    cancelled: 'badge-unknown',
  }

  const teks: Record<BackupStatus, string> = { success: 'berhasil', failed: 'gagal', pending: 'antre', running: 'berjalan', cancelled: 'dibatalkan' }
  return <span className={map[status] ?? 'badge-unknown'}>{teks[status] ?? status}</span>
}

const variantStyles: Record<string, string> = {
  default: 'bg-[#E5E7EB] text-[#374151]',
  admin: 'bg-[#EDE9FE] text-[#5B21B6]',
  operator: 'bg-[#E0E3FF] text-[#2E3AC2]',
  viewer: 'bg-[#E5E7EB] text-[#374151]',
  mikrotik: 'bg-[#FEF3C7] text-[#92400E]',
  database: 'bg-[#CCFBF1] text-[#115E59]',
  virtualizor_db: 'bg-[#E0E3FF] text-[#2E3AC2]',
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
        'pill',
        variantStyles[variant] ?? variantStyles.default,
        className,
      )}
    >
      {children}
    </span>
  )
}
