import React, { useEffect } from 'react'
import { X } from 'lucide-react'
import { cn } from '../../lib/utils'

interface DialogProps {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  className?: string
}

export function Dialog({ open, onClose, title, children, className }: DialogProps) {
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className={cn(
          'relative bg-white border border-[#E2E8F0] rounded-xl shadow-xl w-full max-w-lg p-4 md:p-6',
          'animate-in fade-in zoom-in-95 duration-150',
          className,
        )}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-display font-semibold text-[#0F172A]">{title}</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-[#F8FAFC] text-[#64748B] hover:text-[#0F172A] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
