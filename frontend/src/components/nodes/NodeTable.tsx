import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Play, Power, Edit, Trash2, ChevronRight } from 'lucide-react'
import type { Node } from '../../types'
import { StatusBadge } from '../ui/badge'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { formatDatetimeWIB } from '../../lib/utils'
import {
  useTriggerBackup,
  useToggleNode,
  useDeleteNode,
  useBulkDeleteNodes,
  useDeleteAllNodes,
} from '../../hooks/useNodes'
import { useAuth } from '../../context/AuthContext'
import { toast } from '../ui/toaster'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/alert-dialog'

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
  const bulkDel = useBulkDeleteNodes()
  const deleteAll = useDeleteAllNodes()

  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false)
  const [showDeleteAllDialog, setShowDeleteAllDialog] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

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

  const handleBulkDelete = async () => {
    setIsDeleting(true)
    try {
      await bulkDel.mutateAsync(selectedIds)
      toast(`${selectedIds.length} node berhasil dihapus`, 'success')
      setSelectedIds([])
      setShowBulkDeleteDialog(false)
    } catch (err: any) {
      toast(err.response?.data?.message ?? 'Gagal menghapus node', 'error')
    } finally {
      setIsDeleting(false)
    }
  }

  const handleDeleteAll = async () => {
    setIsDeleting(true)
    try {
      await deleteAll.mutateAsync()
      toast('Semua node berhasil dihapus', 'success')
      setSelectedIds([])
      setShowDeleteAllDialog(false)
    } catch (err: any) {
      toast(err.response?.data?.message ?? 'Gagal menghapus semua node', 'error')
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <>
      {isAdmin && nodes.length > 0 && (
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <div className="flex items-center gap-2">
            {selectedIds.length > 0 && (
              <>
                <span className="text-sm text-slate-500">{selectedIds.length} node dipilih</span>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => setShowBulkDeleteDialog(true)}
                >
                  <Trash2 className="w-4 h-4" />
                  Hapus {selectedIds.length} Node
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setSelectedIds([])}
                >
                  Batalkan Pilihan
                </Button>
              </>
            )}
          </div>
          <Button
            variant="danger"
            size="sm"
            onClick={() => setShowDeleteAllDialog(true)}
          >
            <Trash2 className="w-4 h-4" />
            Hapus Semua Node
          </Button>
        </div>
      )}

      {nodes.length === 0 ? (
        <div className="text-center py-16 text-[#64748B] text-sm">
          No nodes configured yet.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0]">
                {isAdmin && (
                  <th className="px-4 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={selectedIds.length === nodes.length}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedIds(nodes.map((n) => n.id))
                        } else {
                          setSelectedIds([])
                        }
                      }}
                      className="rounded border-gray-300 cursor-pointer"
                    />
                  </th>
                )}
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
                  {isAdmin && (
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(node.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedIds((prev) => [...prev, node.id])
                          } else {
                            setSelectedIds((prev) => prev.filter((id) => id !== node.id))
                          }
                        }}
                        className="rounded border-gray-300 cursor-pointer"
                      />
                    </td>
                  )}
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
      )}

      <AlertDialog open={showBulkDeleteDialog} onOpenChange={setShowBulkDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus {selectedIds.length} Node?</AlertDialogTitle>
            <AlertDialogDescription>
              Tindakan ini tidak dapat dibatalkan. Semua data backup log untuk node yang dipilih juga akan dihapus permanen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowBulkDeleteDialog(false)}>Batal</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={handleBulkDelete}
              disabled={isDeleting}
            >
              {isDeleting ? 'Menghapus...' : `Hapus ${selectedIds.length} Node`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showDeleteAllDialog} onOpenChange={setShowDeleteAllDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Semua Node?</AlertDialogTitle>
            <AlertDialogDescription>
              Tindakan ini akan menghapus SEMUA node beserta seluruh backup log secara permanen. Tindakan ini tidak dapat dibatalkan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowDeleteAllDialog(false)}>Batal</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={handleDeleteAll}
              disabled={isDeleting}
            >
              {isDeleting ? 'Menghapus...' : 'Hapus Semua Node'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
