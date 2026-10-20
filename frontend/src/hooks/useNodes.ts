import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/axios'
import type { DoctorReport, NodesResponse, NodeDetailResponse, NodeFormData, RestoreCheckResult, SkenarioGangguan } from '../types'
import { pollInterval } from './useBackupWatcher'

export function useNodes() {
  return useQuery<NodesResponse>({
    queryKey: ['nodes'],
    queryFn: () => api.get('/nodes').then((r) => r.data),
    // 3 detik selama ada backup berjalan, 30 detik saat tenang.
    refetchInterval: (q) => pollInterval(q.state.data?.data),
    // Tetap memantau walau tab tidak aktif: pengguna sering menekan Backup Now
    // lalu berpindah tab, dan justru hasil akhirnya yang ingin mereka lihat.
    refetchIntervalInBackground: true,
  })
}

export function useNode(id: string) {
  return useQuery<NodeDetailResponse>({
    queryKey: ['node', id],
    queryFn: () => api.get(`/nodes/${id}`).then((r) => r.data),
    refetchInterval: (q) =>
      pollInterval(q.state.data ? [q.state.data.data] : undefined),
    refetchIntervalInBackground: true,
    enabled: !!id,
  })
}

export function useTriggerBackup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (nodeId: string) => api.post(`/nodes/${nodeId}/backup`),
    onSuccess: (_, nodeId) => {
      qc.invalidateQueries({ queryKey: ['nodes'] })
      qc.invalidateQueries({ queryKey: ['node', nodeId] })
    },
  })
}

/** Baca versi + model RouterOS langsung dari router. */
export function useRefreshDevice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (nodeId: string) => api.post(`/nodes/${nodeId}/device-info`),
    onSuccess: (_, nodeId) => {
      qc.invalidateQueries({ queryKey: ['nodes'] })
      qc.invalidateQueries({ queryKey: ['node', nodeId] })
    },
  })
}

export function useRunDoctor() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (nodeId: string) =>
      api.post<{ data: DoctorReport }>(`/nodes/${nodeId}/doctor`).then((r) => r.data.data),
    // Juga saat gagal: galat router tak terjangkau ikut tersimpan di laporan node.
    onSettled: (_, __, nodeId) => {
      qc.invalidateQueries({ queryKey: ['nodes'] })
      qc.invalidateQueries({ queryKey: ['node', nodeId] })
    },
  })
}

export function useRunDoctorAll() {
  return useMutation({
    mutationFn: () => api.post<{ message: string }>('/doctor/run-all').then((r) => r.data),
  })
}

export function useRestoreCheck() {
  return useMutation({
    mutationFn: ({ nodeId, filename }: { nodeId: string; filename: string }) =>
      api
        .get<{ data: RestoreCheckResult }>(`/nodes/${nodeId}/restore-check/${encodeURIComponent(filename)}`)
        .then((r) => r.data.data),
  })
}

export function useSimulateFailure() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ nodeId, skenario }: { nodeId: string; skenario: SkenarioGangguan }) =>
      api.post(`/nodes/${nodeId}/simulate-failure`, { skenario }),
    onSuccess: (_, { nodeId }) => {
      qc.invalidateQueries({ queryKey: ['nodes'] })
      qc.invalidateQueries({ queryKey: ['node', nodeId] })
    },
  })
}

export function useRemoteExecute() {
  return useMutation({
    mutationFn: ({ nodeId, command }: { nodeId: string; command: string }) =>
      api.post(`/nodes/${nodeId}/execute`, { command }).then((r) => r.data),
  })
}

export function useCreateNode() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: NodeFormData) => api.post('/admin/nodes', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['nodes'] }),
  })
}

export function useUpdateNode() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<NodeFormData> }) =>
      api.put(`/admin/nodes/${id}`, data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['nodes'] })
      qc.invalidateQueries({ queryKey: ['node', vars.id] })
    },
  })
}

export function useDeleteNode() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/admin/nodes/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['nodes'] }),
  })
}

export function useToggleNode() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.patch(`/admin/nodes/${id}/toggle`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['nodes'] }),
  })
}

export function useBulkDeleteNodes() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (ids: string[]) => api.delete('/admin/nodes/bulk', { data: { ids } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['nodes'] }),
  })
}

export function useDeleteAllNodes() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.delete('/admin/nodes/all'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['nodes'] }),
  })
}
