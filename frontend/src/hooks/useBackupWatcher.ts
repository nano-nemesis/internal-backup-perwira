import { useEffect, useRef } from 'react'
import { toast } from '../components/ui/toaster'
import type { BackupStatus } from '../types'

interface Watchable {
  id: string
  name: string
  latest_log?: { status: BackupStatus } | null
}

/** Status yang berarti "backup sedang berjalan". */
export const isRunning = (s: BackupStatus | undefined | null) =>
  s === 'running' || s === 'pending'

/**
 * Interval polling untuk query node: dipercepat selama ada backup berjalan,
 * supaya perubahan status terlihat hampir seketika, lalu kembali tenang.
 */
export const pollInterval = (nodes: Watchable[] | undefined) =>
  nodes?.some((n) => isRunning(n.latest_log?.status)) ? 3_000 : 30_000

/**
 * Memberi tahu saat sebuah backup SELESAI — berhasil maupun gagal.
 *
 * Tanpa ini, pengguna menekan "Backup Now" lalu tidak tahu apa-apa sampai
 * pengambilan data berikutnya; backup berjalan di queue, bukan di dalam request.
 */
export function useBackupWatcher(nodes: Watchable[] | undefined) {
  const prev = useRef<Map<string, BackupStatus | undefined>>(new Map())
  // Jangan bersuara pada pemuatan pertama: status yang sudah 'failed' sejak
  // sebelum halaman dibuka bukan kejadian baru.
  const primed = useRef(false)

  useEffect(() => {
    if (!nodes) return

    const now = new Map(nodes.map((n) => [n.id, n.latest_log?.status]))

    if (primed.current) {
      for (const [id, status] of now) {
        const before = prev.current.get(id)
        if (!isRunning(before) || isRunning(status)) continue

        const name = nodes.find((n) => n.id === id)?.name ?? id
        if (status === 'success') {
          toast(`Backup "${name}" berhasil`, 'success')
        } else if (status === 'failed') {
          toast(`Backup "${name}" GAGAL — buka detail node untuk pesan errornya`, 'error')
        }
      }
    }

    prev.current = now
    primed.current = true
  }, [nodes])
}
