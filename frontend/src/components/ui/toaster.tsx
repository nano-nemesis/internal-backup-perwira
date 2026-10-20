import { useEffect, useState } from 'react'
import { X } from 'lucide-react'

interface Toast {
  id: string
  message: string
  type: 'success' | 'error' | 'info'
}

const queue: Toast[] = []
const listeners: Array<(toasts: Toast[]) => void> = []

export function toast(message: string, type: Toast['type'] = 'info') {
  const id = Math.random().toString(36).slice(2)
  queue.push({ id, message, type })
  listeners.forEach((l) => l([...queue]))
  setTimeout(() => {
    const idx = queue.findIndex((t) => t.id === id)
    if (idx >= 0) {
      queue.splice(idx, 1)
      listeners.forEach((l) => l([...queue]))
    }
  }, 4000)
}

export function Toaster() {
  const [items, setItems] = useState<Toast[]>([])

  useEffect(() => {
    listeners.push(setItems)
    return () => {
      const i = listeners.indexOf(setItems)
      if (i >= 0) listeners.splice(i, 1)
    }
  }, [])

  const dismiss = (id: string) => {
    const idx = queue.findIndex((t) => t.id === id)
    if (idx >= 0) {
      queue.splice(idx, 1)
      listeners.forEach((l) => l([...queue]))
    }
  }

  const styles: Record<Toast['type'], string> = {
    success: 'bg-[#0F172A] text-white [&>i]:bg-[#4ADE80]',
    error: 'bg-[#0F172A] text-white [&>i]:bg-[#F87171]',
    info: 'bg-[#0F172A] text-white [&>i]:bg-[#8C99F7]',
  }

  if (items.length === 0) return null

  return (
    <div className="fixed left-4 right-4 bottom-[calc(6rem+env(safe-area-inset-bottom))] md:left-auto md:bottom-4 z-50 flex flex-col gap-2 md:max-w-sm">
      {items.map((t) => (
        <div
          key={t.id}
          role="status"
          className={`flex items-start gap-3 px-4 py-3 rounded-2xl text-sm font-medium shadow-[0_20px_40px_-16px_rgba(15,23,42,0.5)] ${styles[t.type]}`}
        >
          <i aria-hidden="true" className="mt-1.5 w-2 h-2 rounded-full flex-shrink-0" />
          <span className="flex-1 break-words">{t.message}</span>
          <button onClick={() => dismiss(t.id)} aria-label="Tutup" className="-m-1 p-1 opacity-70 hover:opacity-100 flex-shrink-0">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  )
}
