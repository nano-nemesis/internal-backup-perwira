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

/** Unduh konfigurasi node sebagai berkas .json. */
export function useExportNodes() {
  return useMutation({
    mutationFn: async (includeCredentials: boolean) => {
      const { data } = await api.get('/admin/nodes/export', {
        params: { include_credentials: includeCredentials ? 1 : 0 },
      })

      // Blob dibuat di sisi klien, bukan mengandalkan Content-Disposition, supaya
      // kegagalan (mis. 403) tetap sampai sebagai error axios dan bisa ditoast.
      const pretty = JSON.stringify(data, null, 2)
      const url = URL.createObjectURL(new Blob([pretty], { type: 'application/json' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `nodes-${includeCredentials ? 'lengkap' : 'aman'}-${new Date()
        .toISOString()
        .slice(0, 16)
        .replace(/[:T]/g, '-')}.json`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)

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
