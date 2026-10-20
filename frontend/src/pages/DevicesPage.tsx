import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '../components/ui/button'
import { NodeTable } from '../components/nodes/NodeTable'
import { NodeForm } from '../components/nodes/NodeForm'
import { useNodes } from '../hooks/useNodes'
import { useAuth } from '../context/AuthContext'
import type { Node } from '../types'

export default function DevicesPage() {
  const { data, isLoading, isError, fetchStatus, refetch } = useNodes()
  // fetchStatus 'paused' = React Query menganggap browser offline dan MENUNDA request.
  // Dalam keadaan itu isError tetap false selamanya, jadi cek isError saja masih
  // menampilkan "0 node" ke teknisi yang sinyalnya putus — persis kebohongan yang
  // mau ditutup di sini.
  const loadFailed = isError || fetchStatus === 'paused'
  const [showForm, setShowForm] = useState(false)
  const [editingNode, setEditingNode] = useState<Node | null>(null)
  const { isOperator } = useAuth()

  const handleEdit = (node: Node) => {
    setEditingNode(node)
    setShowForm(true)
  }

  const handleClose = () => {
    setShowForm(false)
    setEditingNode(null)
  }

  return (
    <div className="space-y-5 max-w-screen-2xl">
      {loadFailed && (
        <div role="alert" className="rounded-2xl bg-[#FEE2E2] px-4 py-3 text-sm text-[#991B1B] flex items-center justify-between gap-4">
          <span>
            Gagal memuat daftar node, angka di bawah mungkin tidak mencerminkan keadaan
            sebenarnya. Jangan simpulkan node hilang dari daftar kosong.
          </span>
          <button
            onClick={() => refetch()}
            className="px-4 rounded-xl bg-white font-semibold hover:bg-[#FEF2F2] whitespace-nowrap min-h-[44px]"
          >
            Coba lagi
          </button>
        </div>
      )}

      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[28px] leading-tight font-extrabold text-[#0F172A]">Perangkat</h1>
          <p className="text-sm text-[#475569] mt-1">
            {data ? `${data.data.length} node terdaftar` : 'jumlah node tidak diketahui'}
          </p>
        </div>
        {isOperator && (
          <Button onClick={() => setShowForm(true)}>
            <Plus className="w-4 h-4" />
            Tambah node
          </Button>
        )}
      </div>

      <div className="card overflow-hidden lg:pt-5">
        {isLoading ? (
          <div className="p-8 text-center text-[#475569] text-sm animate-pulse">
            Memuat node...
          </div>
        ) : data ? (
          <NodeTable nodes={data.data} onEdit={handleEdit} />
        ) : (
          <div className="p-8 text-center text-[#475569] text-sm">Daftar node tidak bisa dimuat. Ini bukan berarti tidak ada node.</div>
        )}
      </div>

      <NodeForm
        open={showForm}
        onClose={handleClose}
        editingNode={editingNode}
      />
    </div>
  )
}
