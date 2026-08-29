import { useEffect, useState } from 'react'

/**
 * Penanda proses backup yang sedang berjalan.
 *
 * Durasinya tidak bisa diperkirakan — tergantung ukuran konfigurasi atau dump dan
 * kecepatan SSH ke target — jadi bar-nya indeterminate, bukan persentase palsu.
 * Penghitung detik yang berjalan memberi bukti bahwa prosesnya benar-benar hidup,
 * bukan layar yang membeku.
 */
export function BackupProgress({
  startedAt,
  className = '',
}: {
  /** ISO string dari latest_log.created_at */
  startedAt?: string | null
  className?: string
}) {
  const [detik, setDetik] = useState(() => elapsed(startedAt))

  useEffect(() => {
    setDetik(elapsed(startedAt))
    const t = setInterval(() => setDetik(elapsed(startedAt)), 1000)
    return () => clearInterval(t)
  }, [startedAt])

  return (
    <div className={className} role="status" aria-live="polite">
      <div className="flex items-center gap-2">
        <div className="relative h-1 flex-1 min-w-[60px] rounded-full bg-[#DBEAFE] overflow-hidden">
          <div className="absolute inset-y-0 left-0 w-full rounded-full bg-[#0077FF] animate-indeterminate" />
        </div>
        {detik !== null && (
          <span className="text-[11px] font-mono text-[#0077FF] tabular-nums flex-shrink-0">
            {format(detik)}
          </span>
        )}
      </div>
      <span className="sr-only">Backup sedang berjalan</span>
    </div>
  )
}

function elapsed(startedAt?: string | null): number | null {
  if (!startedAt) return null
  const mulai = new Date(startedAt).getTime()
  if (Number.isNaN(mulai)) return null
  // Jam server dan jam browser bisa berbeda; jangan tampilkan angka negatif.
  return Math.max(0, Math.floor((Date.now() - mulai) / 1000))
}

function format(d: number): string {
  if (d < 60) return `${d}s`
  const m = Math.floor(d / 60)
  return `${m}m ${String(d % 60).padStart(2, '0')}s`
}
