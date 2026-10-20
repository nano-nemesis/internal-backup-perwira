import React, { useEffect } from 'react'
import { createPortal } from 'react-dom'
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

  // Portal ke body: dialog yang dibuka dari dalam laci/kartu yang punya transform (mis. sidebar
  // HP) akan terkurung di dalamnya, karena transform menjadi acuan posisi position:fixed.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-[#0F172A]/40 backdrop-blur-sm animate-pudar"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          'relative bg-white rounded-[22px] shadow-[0_30px_60px_-20px_rgba(15,23,42,0.45)] w-full max-w-lg p-5 md:p-7 max-h-[calc(100dvh-2rem)] overflow-y-auto',
          'animate-muncul',
          className,
        )}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-display font-bold text-[#0F172A]">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Tutup"
            className="w-11 h-11 -mr-2 -mt-2 flex items-center justify-center rounded-full hover:bg-[#F1F2F7] text-[#475569] hover:text-[#0F172A] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  )
}
