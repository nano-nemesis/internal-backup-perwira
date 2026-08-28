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
    <div className="space-y-6 max-w-screen-xl">
      {loadFailed && (
        <div className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 flex items-center justify-between gap-4">
          <span>
            Gagal memuat daftar node — angka di bawah mungkin tidak mencerminkan keadaan
            sebenarnya. Jangan simpulkan node hilang dari daftar kosong.
          </span>
          <button
            onClick={() => refetch()}
            className="px-3 py-1.5 rounded-md border border-red-300 hover:bg-red-100 whitespace-nowrap min-h-[44px]"
          >
            Coba lagi
          </button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-mono font-bold text-white">Devices</h1>
          <p className="text-sm text-slate-500 mt-1">
            {data ? `${data.data.length} nodes configured` : 'jumlah node tidak diketahui'}
          </p>
        </div>
        {isOperator && (
          <Button onClick={() => setShowForm(true)}>
            <Plus className="w-4 h-4" />
            Add Node
          </Button>
        )}
      </div>

      <div className="card">
        {isLoading ? (
          <div className="p-8 text-center text-slate-500 font-mono text-sm animate-pulse">
            Loading nodes...
          </div>
        ) : data ? (
          <NodeTable nodes={data.data} onEdit={handleEdit} />
        ) : (
          <div className="p-8 text-center text-[#64748B] text-sm">Daftar node tidak bisa dimuat. Ini bukan berarti tidak ada node.</div>
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
