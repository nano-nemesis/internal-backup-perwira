import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes) return 'N/A'
  const units = ['B', 'KB', 'MB', 'GB']
  let size = bytes
  let i = 0
  while (size >= 1024 && i < 3) {
    size /= 1024
    i++
  }
  return `${size.toFixed(2)} ${units[i]}`
}

export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds) return 'N/A'
  if (seconds < 60) return `${seconds}s`
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}m ${secs}s`
}

export function formatDatetimeWIB(dateString: string | null | undefined): string {
  if (!dateString) return 'Never'
  try {
    const date = new Date(dateString)
    const wib = new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }))
    const year = wib.getFullYear()
    const month = String(wib.getMonth() + 1).padStart(2, '0')
    const day = String(wib.getDate()).padStart(2, '0')
    const hour = String(wib.getHours()).padStart(2, '0')
    const minute = String(wib.getMinutes()).padStart(2, '0')
    return `${year}-${month}-${day} ${hour}:${minute} WIB`
  } catch {
    return dateString
  }
}

export function formatLogTime(dateString: string | null | undefined): string {
  if (!dateString) return ''
  try {
    const date = new Date(dateString)
    const wib = new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }))
    const hour = String(wib.getHours()).padStart(2, '0')
    const minute = String(wib.getMinutes()).padStart(2, '0')
    const second = String(wib.getSeconds()).padStart(2, '0')
    return `${hour}:${minute}:${second} WIB`
  } catch {
    return dateString
  }
}

/**
 * Backup basi: node aktif yang backup berhasil terakhirnya lebih tua dari dua kali jadwalnya
 * (penjadwal macet, atau gagal terus). Node yang belum pernah berhasil tidak dihitung di sini.
 */
export function basi(n: { is_active: boolean; last_backup_at?: string | null; schedule_interval_hours: number }): boolean {
  if (!n.is_active || !n.last_backup_at) return false
  return Date.now() - Date.parse(n.last_backup_at) > 2 * n.schedule_interval_hours * 3_600_000
}

const WIB = 'Asia/Jakarta'
const tanggalWIB = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: WIB }) // YYYY-MM-DD
const jamWIB = (d: Date) => d.toLocaleTimeString('en-GB', { timeZone: WIB, hour: '2-digit', minute: '2-digit' })

/** "Hari ini 19:40", "Kemarin 09:12", "3 hari lalu", lalu "12 Sep 2026". Hitungan hari menurut kalender WIB. */
export function kapan(iso: string | null | undefined): string {
  if (!iso) return '-'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '-'
  const hari = Math.round((Date.parse(tanggalWIB(new Date())) - Date.parse(tanggalWIB(d))) / 86_400_000)
  if (hari <= 0) return `Hari ini ${jamWIB(d)}`
  if (hari === 1) return `Kemarin ${jamWIB(d)}`
  if (hari < 7) return `${hari} hari lalu`
  return d.toLocaleDateString('id-ID', { timeZone: WIB, day: 'numeric', month: 'short', year: 'numeric' })
}

/** "baru saja", "5 menit lalu", "18 jam lalu", "3 hari lalu". */
export function lalu(iso: string | null | undefined): string {
  if (!iso) return '-'
  const detik = (Date.now() - Date.parse(iso)) / 1000
  if (!(detik >= 60)) return 'baru saja'
  if (detik < 3600) return `${Math.floor(detik / 60)} menit lalu`
  if (detik < 86_400) return `${Math.floor(detik / 3600)} jam lalu`
  return `${Math.floor(detik / 86_400)} hari lalu`
}

/** 1.234 / 12,5 GB gaya Indonesia. */
export function ukuran(byte: number): string {
  const satuan = ['B', 'KB', 'MB', 'GB', 'TB']
  let n = byte
  let i = 0
  while (n >= 1024 && i < satuan.length - 1) { n /= 1024; i++ }
  return `${n.toLocaleString('id-ID', { maximumFractionDigits: i ? 1 : 0 })} ${satuan[i]}`
}
