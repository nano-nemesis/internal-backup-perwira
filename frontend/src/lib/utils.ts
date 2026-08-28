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
