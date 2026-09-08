import { useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/axios'

export interface ImportSummary {
  create: number
  update: number
  skip: number
  partial: boolean
}

export interface ImportError {
  index: number
  name: string | null
  errors: string[]
}

export interface ImportResult {
  message: string
  dry_run?: boolean
  summary: ImportSummary
  detail?: { create: string[]; update: string[]; skip: string[] }
}

/** Unduh objek apa pun sebagai berkas .json di sisi klien. */
export function downloadJson(data: unknown, filename: string) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
  )
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/** Contoh berkas impor — satu entri per tipe node, tanpa password. */
export const NODE_TEMPLATE = {
  format: 'internal-backup-perwira/nodes',
  version: 1,
  _petunjuk:
    'Hapus contoh yang tidak dipakai, lalu isi datamu. Password TIDAK ada di berkas ini — ' +
    'isi lewat halaman Devices setelah impor. schedule_interval_hours: 1,2,3,4,6,8,12,24.',
  nodes: [
    {
      name: 'CCR1009-NOC',
      type: 'mikrotik',
      host: '10.29.0.1',
      port: 22,
      ssh_user: 'backup',
      ssh_key_path: null,
      schedule_interval_hours: 6,
      is_active: true,
    },
    {
      name: 'DB-BILLING',
      type: 'database',
      host: '10.29.0.20',
      port: 22,
      ssh_user: 'root',
      ssh_key_path: '/root/.ssh/id_ed25519',
      db_name: 'billing',
      db_user: 'backup',
      schedule_interval_hours: 12,
      is_active: true,
    },
    {
      name: 'VIRTUALIZOR-01',
      type: 'virtualizor_db',
      host: '10.29.0.30',
      port: 22,
      ssh_user: 'root',
      schedule_interval_hours: 24,
      is_active: true,
    },
  ],
}

/** Unduh konfigurasi node sebagai berkas .json. */
export function useExportNodes() {
  return useMutation({
    mutationFn: async (includeCredentials: boolean) => {
      const { data } = await api.get('/admin/nodes/export', {
        params: { include_credentials: includeCredentials ? 1 : 0 },
      })

      // Blob dibuat di sisi klien, bukan mengandalkan Content-Disposition, supaya
      // kegagalan (mis. 403) tetap sampai sebagai error axios dan bisa ditoast.
      downloadJson(
        data,
        `nodes-${includeCredentials ? 'lengkap' : 'aman'}-${new Date()
          .toISOString()
          .slice(0, 16)
          .replace(/[:T]/g, '-')}.json`,
      )

      return data as { nodes: unknown[]; includes_credentials: boolean }
    },
  })
}

export function useImportNodes() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: { nodes: unknown[]; mode: 'skip' | 'update'; dry_run: boolean }) => {
      const { data } = await api.post('/admin/nodes/import', payload)
      return data as ImportResult
    },
    onSuccess: (_res, vars) => {
      if (!vars.dry_run) {
        qc.invalidateQueries({ queryKey: ['nodes'] })
      }
    },
  })
}
