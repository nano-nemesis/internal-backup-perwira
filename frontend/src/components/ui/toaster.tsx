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
    success: 'bg-emerald-900 border-emerald-700 text-emerald-200',
    error: 'bg-red-900 border-red-700 text-red-200',
    info: 'bg-slate-800 border-slate-600 text-slate-200',
  }

  if (items.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {items.map((t) => (
        <div
          key={t.id}
          className={`flex items-start gap-3 px-4 py-3 rounded-lg border text-sm font-mono shadow-xl ${styles[t.type]}`}
        >
          <span className="flex-1">{t.message}</span>
          <button onClick={() => dismiss(t.id)} className="opacity-60 hover:opacity-100 flex-shrink-0">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  )
}
