import { useSyncExternalStore } from 'react'
import type { BackupLog, Node } from '../types'

/**
 * Backup manual yang dipicu dari peramban ini. Dipakai untuk:
 *  - status "Antre" sebelum worker mengambil job-nya (log baru belum ada di server),
 *  - panel proses di pojok layar yang mengikuti pengguna ke halaman mana pun,
 *  - mempercepat polling selama ada yang ditunggu.
 *
 * Dibedakan dari backup sebelumnya lewat ID log terakhir saat tombol ditekan, bukan jam:
 * jam peramban dan server bisa berbeda beberapa menit.
 */
export interface Manual {
  id: string
  nama: string
  logSebelum: string | null
}

const KUNCI = 'backup-manual'
let daftar: Manual[] = (() => {
  try {
    return JSON.parse(sessionStorage.getItem(KUNCI) ?? '[]')
  } catch {
    return []
  }
})()
const pendengar = new Set<() => void>()
const simpan = () => {
  try { sessionStorage.setItem(KUNCI, JSON.stringify(daftar)) } catch { /* mode private: cukup di memori */ }
  pendengar.forEach((f) => f())
}

export function catatManual(node: Pick<Node, 'id' | 'name' | 'latest_log'>, logSebelum?: string | null) {
  daftar = [...daftar.filter((m) => m.id !== node.id), { id: node.id, nama: node.name, logSebelum: logSebelum ?? node.latest_log?.id ?? null }]
  simpan()
}

export function lepasManual(id: string) {
  daftar = daftar.filter((m) => m.id !== id)
  simpan()
}

export const adaManual = () => daftar.length > 0
export const sedangDipantau = (id: string) => daftar.some((m) => m.id === id)

export function useManual(): Manual[] {
  return useSyncExternalStore(
    (f) => { pendengar.add(f); return () => { pendengar.delete(f) } },
    () => daftar,
  )
}

/** Nama tahap seperti yang ditulis BackupService ke backup_logs.tahap. */
export const TAHAP: Record<string, string> = {
  antre: 'Menunggu giliran di antrean',
  ambil: 'Mengambil konfigurasi (/export) lewat SSH',
  simpan: 'Membuat berkas .backup di router',
  salin: 'Menyalin berkas ke server backup',
  dump: 'Menjalankan mysqldump',
  kompres: 'Mengompres dump',
  cari: 'Mencari dump terbaru',
  periksa: 'Memeriksa berkas',
  doctor: 'Membaca versi RouterOS dan Doctor',
}

/** Urutan tahap per tipe node, sesuai alur di backend. */
export function urutanTahap(node: Pick<Node, 'type' | 'backup_binary'>): string[] {
  if (node.type === 'mikrotik') {
    return node.backup_binary ? ['antre', 'simpan', 'salin', 'periksa', 'doctor'] : ['antre', 'ambil', 'periksa', 'doctor']
  }
  return node.type === 'database' ? ['antre', 'dump', 'kompres', 'periksa'] : ['antre', 'cari', 'salin', 'periksa']
}

export type Keadaan =
  | { fase: 'berjalan'; tahap: string; log: BackupLog | null }
  | { fase: 'selesai'; berhasil: boolean; log: BackupLog }

/**
 * Keadaan backup sebuah node untuk ditampilkan. null = tidak ada yang perlu ditampilkan
 * (tidak sedang berjalan, dan bukan backup manual dari peramban ini).
 */
export function keadaan(node: Pick<Node, 'type' | 'backup_binary'>, log: BackupLog | null | undefined, manual?: Manual): Keadaan | null {
  const baru = !!log && (!manual || log.id !== manual.logSebelum)
  if (log && baru && (log.status === 'running' || log.status === 'pending')) {
    return { fase: 'berjalan', tahap: log.status === 'pending' ? 'antre' : log.tahap ?? urutanTahap(node)[1], log }
  }
  if (!manual) return null
  if (!baru || !log) return { fase: 'berjalan', tahap: 'antre', log: null }
  return { fase: 'selesai', berhasil: log.status === 'success', log }
}
