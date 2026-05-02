import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/axios'
import type { NodesResponse, NodeDetailResponse, NodeFormData } from '../types'

export function useNodes() {
  return useQuery<NodesResponse>({
    queryKey: ['nodes'],
    queryFn: () => api.get('/nodes').then((r) => r.data),
    refetchInterval: 30_000,
  })
}

export function useNode(id: string) {
  return useQuery<NodeDetailResponse>({
    queryKey: ['node', id],
    queryFn: () => api.get(`/nodes/${id}`).then((r) => r.data),
    refetchInterval: 30_000,
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
