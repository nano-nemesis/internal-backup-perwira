import React, { useEffect } from 'react'
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm"
        onClick={() => onOpenChange(false)}
      />
      <div className="relative z-50 w-full max-w-md">{children}</div>
    </div>
  )
}

export function AlertDialogContent({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('bg-white border border-[#E2E8F0] rounded-xl shadow-xl p-6', className)}>
      {children}
    </div>
  )
}

export function AlertDialogHeader({ children }: { children: React.ReactNode }) {
  return <div className="mb-4">{children}</div>
}

export function AlertDialogTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-base font-semibold text-[#0F172A] mb-2">{children}</h2>
}

export function AlertDialogDescription({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-[#64748B]">{children}</p>
}

export function AlertDialogFooter({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center justify-end gap-3 mt-6">{children}</div>
}

export function AlertDialogCancel({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-4 py-2 text-sm font-medium rounded-md bg-white border border-[#E2E8F0] text-[#0F172A] hover:bg-[#F8FAFC] transition-colors min-h-[40px]"
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
        'px-4 py-2 text-sm font-medium rounded-md text-white transition-colors min-h-[40px] disabled:opacity-50 disabled:cursor-not-allowed',
        className ?? 'bg-[#E63000] hover:bg-[#C02800]',
      )}
    >
      {children}
    </button>
  )
}
