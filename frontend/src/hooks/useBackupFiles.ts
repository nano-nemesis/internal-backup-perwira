import { useQuery } from '@tanstack/react-query'
import api from '../lib/axios'
import type { BackupFilesResponse } from '../types'

interface BackupFilesParams {
  node_id?: string
  type?: 'mikrotik' | 'database' | ''
  page?: number
  per_page?: number
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
      const { data } = await api.get<BackupFilesResponse>(
        `/backup-files?${query.toString()}`,
      )
      return data
    },
    refetchInterval: 60_000,
  })
}
