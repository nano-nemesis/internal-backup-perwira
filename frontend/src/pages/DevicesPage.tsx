import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '../components/ui/button'
import { NodeTable } from '../components/nodes/NodeTable'
import { NodeForm } from '../components/nodes/NodeForm'
import { useNodes } from '../hooks/useNodes'
import { useAuth } from '../context/AuthContext'
import type { Node } from '../types'

export default function DevicesPage() {
  const { data, isLoading } = useNodes()
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-mono font-bold text-white">Devices</h1>
          <p className="text-sm text-slate-500 mt-1">
            {data?.data?.length ?? 0} nodes configured
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
        ) : (
          <NodeTable nodes={data?.data ?? []} onEdit={handleEdit} />
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
