import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Play, Power, Edit, Trash2, ChevronRight } from 'lucide-react'
import type { Node, NodeType } from '../../types'
import { Button } from '../ui/button'
import { cn, lalu } from '../../lib/utils'
import {
  useTriggerBackup,
  useToggleNode,
  useDeleteNode,
  useBulkDeleteNodes,
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
  /** Baris yang ditampilkan (boleh sudah disaring/diurutkan). */
  nodes: Node[]
  /** Semua node, untuk pemantau backup: node yang tersaring tetap harus dikabari saat selesai. */
  semua?: Node[]
  onEdit: (node: Node) => void
}

export const LABEL_TIPE: Record<NodeType, { teks: string; gaya: string }> = {
  mikrotik: { teks: 'MikroTik', gaya: 'bg-[#FFEDD5] text-[#9A3412]' },
  database: { teks: 'Database', gaya: 'bg-[#CCFBF1] text-[#115E59]' },
  virtualizor_db: { teks: 'Virtualizor', gaya: 'bg-[#E0E3FF] text-[#2E3AC2]' },
}

const ABU = 'bg-[#E5E7EB] text-[#374151]'

/** Lampu Backup: percobaan terakhir, plus kapan terakhir sukses kalau gagal. */
function Backup({ node }: { node: Node }) {
  const log = node.latest_log
  if (isRunning(log?.status)) {
    return (
      <>
        <span className="pill bg-[#E0E3FF] text-[#2E3AC2]">{log?.status === 'running' ? 'Berjalan' : 'Antre'}</span>
        <BackupProgress startedAt={log?.created_at} className="mt-1.5" />
      </>
    )
  }
  const [teks, gaya] = !log
    ? ['Belum ada', ABU]
    : log.status === 'success' ? ['Sehat', 'bg-[#BBF7D0] text-[#14532D]'] : ['Gagal', 'bg-[#FEE2E2] text-[#991B1B]']
  const ket = !log
    ? 'belum pernah dibackup'
    : log.status === 'success'
      ? `${lalu(log.created_at)} · ${node.backup_binary ? '.backup' : node.type === 'mikrotik' ? '.rsc' : '.sql.gz'}`
      : node.last_backup_at ? `sukses ${lalu(node.last_backup_at)}` : 'belum pernah sukses'
  return (
    <>
      <span className={cn('pill', gaya)}>{teks}</span>
      <span className="block text-xs text-[#475569] mt-1 whitespace-nowrap">{ket}</span>
    </>
  )
}

/** Lampu Konfigurasi: ringkasan Doctor (hanya MikroTik). */
export function Konfigurasi({ node }: { node: Node }) {
  if (node.type !== 'mikrotik') return <span className="text-[#94A3B8]">—</span>
  const d = node.doctor
  const r = d?.ringkasan
  const [teks, gaya] = !d
    ? ['Belum diperiksa', ABU]
    : d.galat ? ['Tak terjangkau', ABU]
      : r?.kritis ? [`${r.kritis} kritis`, 'bg-[#DC2626] text-white']
        : r?.peringatan ? [`${r.peringatan} perhatian`, 'bg-[#FEF3C7] text-[#92400E]']
          : ['Sesuai', 'bg-[#BBF7D0] text-[#14532D]']
  return <span className={cn('pill', gaya)}>{teks}</span>
}

const versi = (n: Node) =>
  [n.doctor?.peran?.includes('CHR') && 'CHR', n.routeros_version && `ROS ${n.routeros_version.split(' ')[0]}`]
    .filter(Boolean).join(' · ')

export function NodeTable({ nodes, semua, onEdit }: NodeTableProps) {
  // Dipasang di sini karena NodeTable dipakai Dashboard maupun Devices — satu
  // tempat, dan hanya satu di antaranya yang aktif pada satu waktu, jadi tidak
  // ada notifikasi ganda.
  useBackupWatcher(semua ?? nodes)

  const navigate = useNavigate()
  const { isAdmin, isOperator } = useAuth()
  const trigger = useTriggerBackup()
  const toggle = useToggleNode()
  const del = useDeleteNode()
  const bulkDel = useBulkDeleteNodes()

  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  // Hanya yang masih terlihat: node yang dipilih lalu tersembunyi oleh saringan
  // tidak boleh ikut terhapus diam-diam.
  const terpilih = selectedIds.filter((id) => nodes.some((n) => n.id === id))

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
      await bulkDel.mutateAsync(terpilih)
      toast(`${terpilih.length} node berhasil dihapus`, 'success')
      setSelectedIds([])
      setShowBulkDeleteDialog(false)
    } catch (err: any) {
      toast(err.response?.data?.message ?? 'Gagal menghapus node', 'error')
    } finally {
      setIsDeleting(false)
    }
  }

  if (nodes.length === 0) {
    return <div className="text-center py-16 text-[#475569] text-sm">Belum ada node.</div>
  }

  return (
    <>
      {isAdmin && terpilih.length > 0 && (
        <div className="hidden lg:flex items-center gap-2 flex-wrap px-5 pt-1 pb-3 animate-pudar">
          <span className="text-sm font-semibold text-[#334155]">{terpilih.length} node dipilih</span>
          <Button variant="danger" size="sm" onClick={() => setShowBulkDeleteDialog(true)}>
            <Trash2 className="w-4 h-4" />
            Hapus {terpilih.length} node
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setSelectedIds([])}>
            Batalkan pilihan
          </Button>
        </div>
      )}

      {/* HP & tablet: daftar kartu. Aksi per node ada di halaman detail. */}
      <ul className="lg:hidden divide-y divide-[#EEF0F6] px-5 berurutan">
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
                <span className="block text-xs text-[#475569] mt-0.5 truncate font-mono">{node.host}</span>
                {node.type === 'mikrotik' && (
                  <span className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                    <Konfigurasi node={node} />
                  </span>
                )}
              </span>
              <span className="flex flex-col items-end text-right">
                <Backup node={node} />
              </span>
              <ChevronRight className="w-4 h-4 text-[#94A3B8] flex-shrink-0" />
            </button>
          </li>
        ))}
      </ul>

      <div className="hidden lg:block overflow-x-auto px-2 pb-2">
        <table className="w-full text-sm">
          <thead>
            <tr>
              {isAdmin && (
                <th className="th w-10">
                  <input
                    type="checkbox"
                    aria-label="Pilih semua"
                    checked={terpilih.length === nodes.length}
                    onChange={(e) => setSelectedIds(e.target.checked ? nodes.map((n) => n.id) : [])}
                    className="w-4 h-4 accent-[#4255F0] cursor-pointer"
                  />
                </th>
              )}
              <th className="th">Router</th>
              {/* Layar sedang: kolom Tipe disembunyikan, ringkasannya pindah ke bawah nama. */}
              <th className="th hidden xl:table-cell">Tipe</th>
              <th className="th">Backup</th>
              <th className="th">Konfigurasi</th>
              <th className="th hidden 2xl:table-cell">Jadwal</th>
              <th className="th"><span className="sr-only">Aksi</span></th>
            </tr>
          </thead>
          <tbody>
            {nodes.map((node) => (
              <tr
                key={node.id}
                onClick={() => navigate(`/devices/${node.id}`)}
                className="border-t border-[#EEF0F6] hover:bg-[#F8F9FC] cursor-pointer transition-colors group"
              >
                {isAdmin && (
                  <td className="px-3 py-3.5" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      aria-label={`Pilih ${node.name}`}
                      checked={selectedIds.includes(node.id)}
                      onChange={(e) =>
                        setSelectedIds((prev) => (e.target.checked ? [...prev, node.id] : prev.filter((id) => id !== node.id)))
                      }
                      className="w-4 h-4 accent-[#4255F0] cursor-pointer"
                    />
                  </td>
                )}
                <td className="px-3 py-3.5">
                  <div className="flex items-center gap-2">
                    <span
                      title={node.is_active ? 'aktif' : 'nonaktif'}
                      className={`w-2 h-2 rounded-full flex-shrink-0 ${node.is_active ? 'bg-[#16A34A]' : 'bg-[#CBD5E1]'}`}
                    />
                    <span className={cn('font-bold', node.is_active ? 'text-[#0F172A]' : 'text-[#475569]')}>{node.name}</span>
                  </div>
                  <p className="text-xs text-[#475569] font-mono mt-0.5 pl-4 whitespace-nowrap">
                    {node.host}
                    <span className="xl:hidden font-sans"> · {LABEL_TIPE[node.type].teks}</span>
                  </p>
                </td>
                <td className="px-3 py-3.5 hidden xl:table-cell">
                  <span className={cn('pill', LABEL_TIPE[node.type].gaya)}>{LABEL_TIPE[node.type].teks}</span>
                  {versi(node) && (
                    <span className="block text-xs text-[#475569] mt-1 whitespace-nowrap" title={node.routeros_model ?? undefined}>
                      {versi(node)}
                    </span>
                  )}
                </td>
                <td className="px-3 py-3.5 min-w-[150px]">
                  <Backup node={node} />
                </td>
                <td className="px-3 py-3.5 whitespace-nowrap">
                  <Konfigurasi node={node} />
                </td>
                <td className="px-3 py-3.5 text-[#475569] hidden 2xl:table-cell whitespace-nowrap">
                  {node.schedule_interval_hours} jam
                </td>
                <td className="px-2 py-2">
                  <div className="flex items-center justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
                    {isOperator && (
                      <button
                        title="Backup sekarang"
                        aria-label={`Backup ${node.name} sekarang`}
                        onClick={(e) => handleBackup(node, e)}
                        disabled={trigger.isPending || !node.is_active}
                        className="bg-[#F0FDF4] hover:bg-[#DCFCE7] text-[#15803D] transition-colors disabled:opacity-40 w-9 h-9 rounded-[10px] flex items-center justify-center"
                      >
                        <Play className="w-4 h-4" />
                      </button>
                    )}
                    {isAdmin && (
                      <>
                        <button
                          title="Ubah node"
                          aria-label={`Ubah ${node.name}`}
                          onClick={(e) => {
                            e.stopPropagation()
                            onEdit(node)
                          }}
                          className="hover:bg-[#F1F2F7] text-[#334155] transition-colors w-9 h-9 rounded-[10px] flex items-center justify-center"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          title={node.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                          aria-label={`${node.is_active ? 'Nonaktifkan' : 'Aktifkan'} ${node.name}`}
                          onClick={(e) => handleToggle(node, e)}
                          className={`transition-colors w-9 h-9 rounded-[10px] flex items-center justify-center ${
                            node.is_active ? 'hover:bg-[#FEF3C7] text-[#B45309]' : 'hover:bg-[#DCFCE7] text-[#15803D]'
                          }`}
                        >
                          <Power className="w-4 h-4" />
                        </button>
                        <button
                          title="Hapus"
                          aria-label={`Hapus ${node.name}`}
                          onClick={(e) => handleDelete(node, e)}
                          className="hover:bg-[#FEE2E2] text-[#B91C1C] transition-colors w-9 h-9 rounded-[10px] flex items-center justify-center"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <AlertDialog open={showBulkDeleteDialog} onOpenChange={setShowBulkDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus {terpilih.length} node?</AlertDialogTitle>
            <AlertDialogDescription>
              Tindakan ini tidak dapat dibatalkan. Semua log backup untuk node yang dipilih juga akan dihapus permanen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowBulkDeleteDialog(false)}>Batal</AlertDialogCancel>
            <AlertDialogAction
              className="bg-[#DC2626] hover:bg-[#B91C1C] text-white"
              onClick={handleBulkDelete}
              disabled={isDeleting}
            >
              {isDeleting ? 'Menghapus...' : `Hapus ${terpilih.length} node`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
