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
import { useBackupWatcher, isRunning } from '../../hooks/useBackupWatcher'
import { BackupProgress } from './BackupProgress'
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
  // Dipasang di sini karena NodeTable dipakai Dashboard maupun Devices — satu
  // tempat, dan hanya satu di antaranya yang aktif pada satu waktu, jadi tidak
  // ada notifikasi ganda.
  useBackupWatcher(nodes)

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
  const [deleteAllConfirm, setDeleteAllConfirm] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)

  const handleBackup = async (node: Node, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await trigger.mutateAsync(node.id)
      toast(`Backup "${node.name}" dimulai, statusnya diperbarui otomatis`, 'info')
    } catch (err: any) {
      toast(err.response?.data?.message ?? 'Gagal memulai backup', 'error')
    }
  }

  const handleToggle = async (node: Node, e: React.MouseEvent) => {
    e.stopPropagation()
    await toggle.mutateAsync(node.id)
    toast(`Node ${node.is_active ? 'dinonaktifkan' : 'diaktifkan'}`, 'info')
  }

  const handleDelete = async (node: Node, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm(`Hapus node "${node.name}"? Semua log backup-nya ikut terhapus.`)) return
    try {
      await del.mutateAsync(node.id)
      toast(`Node "${node.name}" dihapus`, 'success')
    } catch {
      toast('Gagal menghapus node', 'error')
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
        <div className="hidden lg:flex items-center justify-between gap-2 flex-wrap px-6 pb-3">
          <div className="flex items-center gap-2">
            {selectedIds.length > 0 && (
              <>
                <span className="text-sm font-semibold text-[#334155]">{selectedIds.length} node dipilih</span>
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
          {/* Sengaja tidak mencolok: aksi paling merusak di halaman ini. */}
          <button
            onClick={() => setShowDeleteAllDialog(true)}
            className="inline-flex ml-auto min-h-[40px] px-3 rounded-xl text-[13px] font-semibold text-[#991B1B] hover:bg-[#FEE2E2] items-center gap-1.5 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            Hapus semua node
          </button>
        </div>
      )}

      {nodes.length === 0 ? (
        <div className="text-center py-16 text-[#475569] text-sm">
          Belum ada node.
        </div>
      ) : (
        <>
        {/* HP & tablet: daftar kartu. Aksi per node ada di halaman detail. */}
        <ul className="lg:hidden divide-y divide-[#EEF0F6] px-5">
          {nodes.map((node) => (
            <li key={node.id}>
              <button
                onClick={() => navigate(`/devices/${node.id}`)}
                className="w-full flex items-center gap-3 py-3.5 text-left min-h-[64px]"
              >
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${node.is_active ? 'bg-[#16A34A]' : 'bg-[#CBD5E1]'}`} />
                    <span className="font-bold text-sm truncate">{node.name}</span>
                  </span>
                  <span className="block text-xs text-[#475569] mt-0.5 truncate">
                    {node.type}
                    {node.routeros_version && <span className="font-mono"> · ROS {node.routeros_version.split(' ')[0]}</span>}
                  </span>
                  <span className="block text-xs text-[#475569]">
                    {formatDatetimeWIB(node.latest_log?.created_at ?? node.last_backup_at)}
                  </span>
                  {isRunning(node.latest_log?.status) && (
                    <BackupProgress startedAt={node.latest_log?.created_at} className="mt-1.5" />
                  )}
                </span>
                <StatusBadge status={node.latest_log?.status} />
                <ChevronRight className="w-4 h-4 text-[#94A3B8] flex-shrink-0" />
              </button>
            </li>
          ))}
        </ul>
        <div className="hidden lg:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-y border-[#EEF0F6] bg-[#F8F9FC]">
                {isAdmin && (
                  <th className="px-3 py-3 w-10">
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
                      className="w-4 h-4 accent-[#4255F0] cursor-pointer"
                    />
                  </th>
                )}
                {['Nama', 'Tipe', 'Jadwal', 'Status', 'Percobaan terakhir', ''].map((h) => (
                  <th
                    key={h}
                    className={`px-3 py-3 text-left text-xs font-semibold text-[#475569] whitespace-nowrap ${
                      h === 'Jadwal' ? 'hidden 2xl:table-cell' : h === 'Tipe' ? 'hidden xl:table-cell' : ''
                    }`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EEF0F6]">
              {nodes.map((node) => (
                <tr
                  key={node.id}
                  onClick={() => navigate(`/devices/${node.id}`)}
                  className="hover:bg-[#F4F5FA] cursor-pointer transition-colors group"
                >
                  {isAdmin && (
                    <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
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
                        className="w-4 h-4 accent-[#4255F0] cursor-pointer"
                      />
                    </td>
                  )}
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-2 h-2 rounded-full flex-shrink-0 ${
                          node.is_active ? 'bg-[#16A34A]' : 'bg-[#CBD5E1]'
                        }`}
                      />
                      <span className="font-bold text-[#0F172A]">{node.name}</span>
                    </div>
                    <p className="text-[11px] text-[#475569] font-mono mt-0.5 pl-4 whitespace-nowrap">
                      {node.host}:{node.port}
                      {/* Layar sedang: kolom Tipe disembunyikan, ringkasannya pindah ke sini. */}
                      <span className="xl:hidden"> · {node.type}{node.routeros_version && ` ${node.routeros_version.split(' ')[0]}`}</span>
                    </p>
                  </td>
                  <td className="px-3 py-3 hidden xl:table-cell">
                    <Badge variant={node.type}>{node.type}</Badge>
                    {/* Di bawah badge, bukan kolom sendiri: kolom tambahan membuat tabel
                        melebar di layar 1280 px dan tombol aksi terpotong. */}
                    {node.type === 'mikrotik' && node.routeros_version && (
                      <p className="text-[11px] text-[#475569] font-mono mt-1 whitespace-nowrap" title={node.routeros_model ?? undefined}>
                        ROS {node.routeros_version.split(' ')[0]}
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-3 text-[#475569] text-xs hidden 2xl:table-cell whitespace-nowrap">
                    {node.schedule_interval_hours} jam
                  </td>
                  <td className="px-3 py-3 min-w-[132px]">
                    <StatusBadge status={node.latest_log?.status} />
                    {isRunning(node.latest_log?.status) && (
                      <BackupProgress
                        startedAt={node.latest_log?.created_at}
                        className="mt-1.5"
                      />
                    )}
                  </td>
                  {/* Percobaan terakhir, bukan sukses terakhir — supaya tanggal ini
                      konsisten dengan StatusBadge di sebelahnya. Kalau pakai
                      last_backup_at, node yang gagal 3 malam tetap menampilkan tanggal
                      sukses lama yang terlihat menenangkan. */}
                  <td className="px-3 py-3 text-[#475569] text-xs">
                    {formatDatetimeWIB(node.latest_log?.created_at ?? node.last_backup_at)}
                  </td>
                  <td className="px-3 py-3">
                    <div
                      className="flex items-center gap-0.5"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {isOperator && (
                        <button
                          title="Backup sekarang"
                          aria-label={`Backup ${node.name} sekarang`}
                          onClick={(e) => handleBackup(node, e)}
                          disabled={trigger.isPending}
                          className="hover:bg-[#DCFCE7] text-[#16A34A] transition-colors disabled:opacity-50 w-9 h-9 rounded-xl flex items-center justify-center"
                        >
                          <Play className="w-4 h-4" />
                        </button>
                      )}
                      {isAdmin && (
                        <>
                          <button
                            title="Edit"
                            aria-label={`Edit ${node.name}`}
                            onClick={(e) => {
                              e.stopPropagation()
                              onEdit(node)
                            }}
                            className="hover:bg-[#F4F5FA] text-[#475569] transition-colors w-9 h-9 rounded-xl flex items-center justify-center"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            title={node.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                            aria-label={`${node.is_active ? 'Nonaktifkan' : 'Aktifkan'} ${node.name}`}
                            onClick={(e) => handleToggle(node, e)}
                            className={`transition-colors w-9 h-9 rounded-xl flex items-center justify-center ${
                              node.is_active
                                ? 'hover:bg-[#FEF3C7] text-[#D97706]'
                                : 'hover:bg-[#DCFCE7] text-[#16A34A]'
                            }`}
                          >
                            <Power className="w-4 h-4" />
                          </button>
                          <button
                            title="Hapus"
                            aria-label={`Hapus ${node.name}`}
                            onClick={(e) => handleDelete(node, e)}
                            className="hover:bg-[#FEE2E2] text-[#B91C1C] transition-colors w-9 h-9 rounded-xl flex items-center justify-center"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}
                      <ChevronRight className="hidden xl:block w-4 h-4 text-[#CBD5E1] group-hover:text-[#475569] transition-colors ml-1" />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
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
              className="bg-[#DC2626] hover:bg-[#B91C1C] text-white"
              onClick={handleBulkDelete}
              disabled={isDeleting}
            >
              {isDeleting ? 'Menghapus...' : `Hapus ${selectedIds.length} Node`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={showDeleteAllDialog}
        onOpenChange={(open) => {
          setShowDeleteAllDialog(open)
          if (!open) setDeleteAllConfirm('')
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Semua Node?</AlertDialogTitle>
            <AlertDialogDescription>
              Tindakan ini akan menghapus SEMUA node beserta seluruh backup log secara permanen, termasuk kredensial SSH/DB tiap node. Tindakan ini tidak dapat dibatalkan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="px-1 pb-1">
            <label htmlFor="delete-all-confirm" className="block text-sm text-[#475569] mb-2">
              Ketik <span className="font-mono font-semibold text-[#991B1B]">HAPUS SEMUA</span> untuk mengaktifkan tombol.
            </label>
            <input
              id="delete-all-confirm"
              autoComplete="off"
              value={deleteAllConfirm}
              onChange={(e) => setDeleteAllConfirm(e.target.value)}
              className="w-full px-3.5 py-2 border border-[#DADDE8] rounded-xl font-mono text-sm min-h-[44px] focus:outline-none focus:border-[#4255F0] focus:ring-4 focus:ring-[#4255F0]/15"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowDeleteAllDialog(false)}>Batal</AlertDialogCancel>
            <AlertDialogAction
              className="bg-[#DC2626] hover:bg-[#B91C1C] text-white"
              onClick={handleDeleteAll}
              disabled={isDeleting || deleteAllConfirm !== 'HAPUS SEMUA'}
            >
              {isDeleting ? 'Menghapus...' : 'Hapus Semua Node'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
