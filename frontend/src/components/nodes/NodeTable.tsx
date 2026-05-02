import { useNavigate } from 'react-router-dom'
import { Play, Power, Edit, Trash2, ChevronRight } from 'lucide-react'
import type { Node } from '../../types'
import { StatusBadge } from '../ui/badge'
import { Badge } from '../ui/badge'
import { formatDatetimeWIB } from '../../lib/utils'
import { useTriggerBackup, useToggleNode, useDeleteNode } from '../../hooks/useNodes'
import { useAuth } from '../../context/AuthContext'
import { toast } from '../ui/toaster'

interface NodeTableProps {
  nodes: Node[]
  onEdit: (node: Node) => void
}

export function NodeTable({ nodes, onEdit }: NodeTableProps) {
  const navigate = useNavigate()
  const { isAdmin, isOperator } = useAuth()
  const trigger = useTriggerBackup()
  const toggle = useToggleNode()
  const del = useDeleteNode()

  const handleBackup = async (node: Node, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await trigger.mutateAsync(node.id)
      toast(`Backup queued for ${node.name}`, 'success')
    } catch (err: any) {
      toast(err.response?.data?.message ?? 'Failed to queue backup', 'error')
    }
  }

  const handleToggle = async (node: Node, e: React.MouseEvent) => {
    e.stopPropagation()
    await toggle.mutateAsync(node.id)
    toast(`Node ${node.is_active ? 'deactivated' : 'activated'}`, 'info')
  }

  const handleDelete = async (node: Node, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm(`Delete node "${node.name}"? This will also delete all backup logs.`)) return
    try {
      await del.mutateAsync(node.id)
      toast(`Node "${node.name}" deleted`, 'success')
    } catch {
      toast('Failed to delete node', 'error')
    }
  }

  if (nodes.length === 0) {
    return (
      <div className="text-center py-16 text-[#64748B] text-sm">
        No nodes configured yet.
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0]">
            {['Name', 'Type', 'Host', 'Interval', 'Status', 'Last Backup', ''].map((h) => (
              <th
                key={h}
                className={`px-4 py-3 text-left text-xs font-semibold text-[#64748B] uppercase tracking-wider ${
                  h === 'Host' || h === 'Interval' ? 'hidden md:table-cell' : ''
                }`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#F1F5F9]">
          {nodes.map((node) => (
            <tr
              key={node.id}
              onClick={() => navigate(`/devices/${node.id}`)}
              className="hover:bg-[#F8FAFC] cursor-pointer transition-colors group"
            >
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <span
                    className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      node.is_active ? 'bg-[#16A34A]' : 'bg-[#CBD5E1]'
                    }`}
                  />
                  <span className="font-medium text-[#0F172A]">{node.name}</span>
                </div>
              </td>
              <td className="px-4 py-3">
                <Badge variant={node.type}>{node.type}</Badge>
              </td>
              <td className="px-4 py-3 text-[#64748B] font-mono text-xs hidden md:table-cell">
                {node.host}:{node.port}
              </td>
              <td className="px-4 py-3 text-[#64748B] text-xs hidden md:table-cell">
                {node.schedule_interval_hours}h
              </td>
              <td className="px-4 py-3">
                <StatusBadge status={node.latest_log?.status} />
              </td>
              <td className="px-4 py-3 text-[#64748B] text-xs">
                {formatDatetimeWIB(node.last_backup_at)}
              </td>
              <td className="px-4 py-3">
                <div
                  className="flex items-center gap-0.5"
                  onClick={(e) => e.stopPropagation()}
                >
                  {isOperator && (
                    <button
                      title="Backup Now"
                      onClick={(e) => handleBackup(node, e)}
                      disabled={trigger.isPending}
                      className="p-1.5 rounded-md hover:bg-[#F0FDF4] text-[#16A34A] transition-colors disabled:opacity-50 min-h-[36px] min-w-[36px] flex items-center justify-center"
                    >
                      <Play className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {isAdmin && (
                    <>
                      <button
                        title="Edit"
                        onClick={(e) => {
                          e.stopPropagation()
                          onEdit(node)
                        }}
                        className="p-1.5 rounded-md hover:bg-[#F8FAFC] text-[#64748B] transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center"
                      >
                        <Edit className="w-3.5 h-3.5" />
                      </button>
                      <button
                        title={node.is_active ? 'Deactivate' : 'Activate'}
                        onClick={(e) => handleToggle(node, e)}
                        className={`p-1.5 rounded-md transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center ${
                          node.is_active
                            ? 'hover:bg-[#FFF7ED] text-[#FF8C00]'
                            : 'hover:bg-[#F0FDF4] text-[#16A34A]'
                        }`}
                      >
                        <Power className="w-3.5 h-3.5" />
                      </button>
                      <button
                        title="Delete"
                        onClick={(e) => handleDelete(node, e)}
                        className="p-1.5 rounded-md hover:bg-[#FEF2F0] text-[#E63000] transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                  <ChevronRight className="w-4 h-4 text-[#CBD5E1] group-hover:text-[#64748B] transition-colors ml-1" />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
