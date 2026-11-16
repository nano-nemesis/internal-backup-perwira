import { useQuery, keepPreviousData } from '@tanstack/react-query'
import api from '../lib/axios'
import type { LaporanBackupResponse } from '../types'

export function useLaporanBackup(dari: string, sampai: string) {
  return useQuery<LaporanBackupResponse>({
    queryKey: ['laporan-backup', dari, sampai],
    queryFn: () => api.get('/laporan-backup', { params: { dari, sampai } }).then((r) => r.data),
    enabled: !!dari && !!sampai && dari <= sampai,
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  })
}
