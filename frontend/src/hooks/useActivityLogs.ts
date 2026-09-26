import { useQuery, keepPreviousData } from '@tanstack/react-query'
import api from '../lib/axios'
import type { ActivityLogsResponse } from '../types'

export interface ActivityLogParams {
  level?: string
  kategori?: string
  node_id?: string
  q?: string
  dari?: string
  sampai?: string
  page?: number
}

export function useActivityLogs(params: ActivityLogParams) {
  return useQuery<ActivityLogsResponse>({
    queryKey: ['activity-logs', params],
    queryFn: async () => {
      const query = new URLSearchParams()
      for (const [k, v] of Object.entries(params)) if (v) query.set(k, String(v))
      const { data } = await api.get<ActivityLogsResponse>(`/admin/activity-logs?${query}`)
      return data
    },
    placeholderData: keepPreviousData,
    refetchInterval: 15_000,
  })
}
