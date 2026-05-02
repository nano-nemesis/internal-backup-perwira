import { useQuery } from '@tanstack/react-query'
import api from '../lib/axios'
import type { VpsMetricsResponse } from '../types'

export function useVpsMetrics() {
  return useQuery<VpsMetricsResponse>({
    queryKey: ['vps-metrics'],
    queryFn: () => api.get('/vps-metrics').then((r) => r.data),
    refetchInterval: 30_000,
  })
}
