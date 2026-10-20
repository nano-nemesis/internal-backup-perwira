import React, { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../../lib/utils'

interface AlertDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
}

export function AlertDialog({ open, onOpenChange, children }: AlertDialogProps) {
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onOpenChange])

  if (!open) return null

  // Portal ke body, sama seperti Dialog: jangan terkurung induk yang punya transform.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-[#0F172A]/40 backdrop-blur-sm animate-pudar"
        onClick={() => onOpenChange(false)}
      />
      {/* alertdialog + aria-modal: dialog ini memagari aksi destruktif (hapus node,
          hapus semua). Tanpa peran ini pembaca layar tidak mengumumkannya sama sekali.
          Catatan: fokus belum dikurung di dalam dialog: Tab masih bisa menjangkau
          elemen di belakang overlay. */}
      <div role="alertdialog" aria-modal="true" className="relative z-50 w-full max-w-md animate-muncul">
        {children}
      </div>
    </div>,
    document.body,
  )
}

export function AlertDialogContent({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('bg-white rounded-[22px] shadow-[0_30px_60px_-20px_rgba(15,23,42,0.45)] p-6', className)}>
      {children}
    </div>
  )
}

export function AlertDialogHeader({ children }: { children: React.ReactNode }) {
  return <div className="mb-4">{children}</div>
}

export function AlertDialogTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-lg font-bold text-[#0F172A] mb-2">{children}</h2>
}

export function AlertDialogDescription({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-[#475569]">{children}</p>
}

export function AlertDialogFooter({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center justify-end gap-3 mt-6">{children}</div>
}

export function AlertDialogCancel({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-4 py-2 text-sm font-semibold rounded-[14px] bg-white border border-[#DADDE8] text-[#0F172A] hover:bg-[#F4F5FA] transition-colors min-h-[44px]"
    >
      {children}
    </button>
  )
}

export function AlertDialogAction({
  children,
  onClick,
  disabled,
  className,
}: {
  children: React.ReactNode
  onClick?: () => void
  disabled?: boolean
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'px-4 py-2 text-sm font-semibold rounded-[14px] text-white transition-colors min-h-[44px] disabled:opacity-50 disabled:cursor-not-allowed',
        className ?? 'bg-[#DC2626] hover:bg-[#B91C1C]',
      )}
    >
      {children}
    </button>
  )
}
