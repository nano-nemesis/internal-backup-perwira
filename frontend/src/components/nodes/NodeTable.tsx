import { useNavigate } from 'react-router-dom'
import { Play, Power, Edit, Trash2, ChevronRight } from 'lucide-react'
import type { Node } from '../../types'
import { StatusBadge } from '../ui/badge'
import { Badge } from '../ui/badge'
import { timeAgo } from '../../lib/utils'
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
      <div className="text-center py-16 text-slate-500 font-mono text-sm">
        No nodes configured yet.
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-700">
            {['Name', 'Type', 'Host', 'Interval', 'Status', 'Last Backup', ''].map((h) => (
              <th
                key={h}
                className="px-4 py-3 text-left text-xs font-mono text-slate-500 uppercase tracking-wider"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {nodes.map((node) => (
            <tr
              key={node.id}
              onClick={() => navigate(`/devices/${node.id}`)}
              className="hover:bg-slate-800/40 cursor-pointer transition-colors group"
            >
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <span
                    className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      node.is_active ? 'bg-emerald-500' : 'bg-slate-600'
                    }`}
                  />
                  <span className="font-mono text-slate-200">{node.name}</span>
                </div>
              </td>
              <td className="px-4 py-3">
                <Badge variant={node.type}>{node.type}</Badge>
              </td>
              <td className="px-4 py-3 text-slate-400 font-mono text-xs">
                {node.host}:{node.port}
              </td>
              <td className="px-4 py-3 text-slate-400 text-xs">
                {node.schedule_interval_hours}h
              </td>
              <td className="px-4 py-3">
                <StatusBadge status={node.latest_log?.status} />
              </td>
              <td className="px-4 py-3 text-slate-400 text-xs">
                {timeAgo(node.last_backup_at)}
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
                      className="p-1.5 rounded hover:bg-emerald-900/50 text-emerald-500 transition-colors disabled:opacity-50"
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
                        className="p-1.5 rounded hover:bg-slate-700 text-slate-400 transition-colors"
                      >
                        <Edit className="w-3.5 h-3.5" />
                      </button>
                      <button
                        title={node.is_active ? 'Deactivate' : 'Activate'}
                        onClick={(e) => handleToggle(node, e)}
                        className={`p-1.5 rounded transition-colors ${
                          node.is_active
                            ? 'hover:bg-yellow-900/50 text-yellow-500'
                            : 'hover:bg-green-900/50 text-green-500'
                        }`}
                      >
                        <Power className="w-3.5 h-3.5" />
                      </button>
                      <button
                        title="Delete"
                        onClick={(e) => handleDelete(node, e)}
                        className="p-1.5 rounded hover:bg-red-900/50 text-red-500 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                  <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-slate-400 transition-colors ml-1" />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
