import { keepPreviousData, useQuery } from '@tanstack/react-query'
import api from '../lib/axios'
import type { BackupFilesResponse, JenisBerkas, NodeType, UrutBerkas } from '../types'

interface BackupFilesParams {
  node_id?: string
  type?: NodeType | ''
  page?: number
  per_page?: number
  q?: string
  jenis?: JenisBerkas | ''
  urut?: UrutBerkas
}

export function useBackupFiles(params: BackupFilesParams = {}) {
  return useQuery<BackupFilesResponse>({
    queryKey: ['backup-files', params],
    queryFn: async () => {
      const query = new URLSearchParams()
      if (params.node_id) query.set('node_id', params.node_id)
      if (params.type) query.set('type', params.type)
      if (params.page) query.set('page', String(params.page))
      if (params.per_page) query.set('per_page', String(params.per_page))
      if (params.q) query.set('q', params.q)
      if (params.jenis) query.set('jenis', params.jenis)
      if (params.urut) query.set('urut', params.urut)
      const { data } = await api.get<BackupFilesResponse>(
        `/backup-files?${query.toString()}`,
      )
      return data
    },
    refetchInterval: 60_000,
    // Daftar lama tetap tampil selama hasil pencarian baru dimuat, supaya tabel tidak berkedip kosong.
    placeholderData: keepPreviousData,
  })
}
