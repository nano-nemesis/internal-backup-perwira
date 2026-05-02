import { useState, useEffect } from 'react'
import { Dialog } from '../ui/dialog'
import { Input } from '../ui/input'
import { Select } from '../ui/select'
import { Button } from '../ui/button'
import { useCreateNode, useUpdateNode } from '../../hooks/useNodes'
import { toast } from '../ui/toaster'
import type { Node, NodeFormData, NodeType } from '../../types'

interface NodeFormProps {
  open: boolean
  onClose: () => void
  editingNode?: Node | null
}

const emptyForm: NodeFormData = {
  name: '',
  type: 'mikrotik',
  host: '',
  port: 22,
  ssh_user: '',
  ssh_password: '',
  ssh_key_path: '',
  db_name: '',
  db_user: '',
  db_password: '',
  schedule_interval_hours: 24,
}

function formFromNode(node: Node): NodeFormData {
  return {
    name: node.name,
    type: node.type,
    host: node.host,
    port: node.port,
    ssh_user: node.ssh_user ?? '',
    ssh_password: '',
    ssh_key_path: node.ssh_key_path ?? '',
    db_name: node.db_name ?? '',
    db_user: node.db_user ?? '',
    db_password: '',
    schedule_interval_hours: node.schedule_interval_hours,
  }
}

export function NodeForm({ open, onClose, editingNode }: NodeFormProps) {
  const [form, setForm] = useState<NodeFormData>(
    editingNode ? formFromNode(editingNode) : emptyForm,
  )

  useEffect(() => {
    if (open) {
      setForm(editingNode ? formFromNode(editingNode) : emptyForm)
    }
  }, [open, editingNode])

  const create = useCreateNode()
  const update = useUpdateNode()

  const set = <K extends keyof NodeFormData>(k: K, v: NodeFormData[K]) =>
    setForm((prev) => ({ ...prev, [k]: v }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      if (editingNode) {
        await update.mutateAsync({ id: editingNode.id, data: form })
        toast(`Node "${form.name}" updated`, 'success')
      } else {
        await create.mutateAsync(form)
        toast(`Node "${form.name}" created`, 'success')
      }
      onClose()
    } catch (err: any) {
      const msg =
        err.response?.data?.errors
          ? Object.values(err.response.data.errors).flat().join(', ')
          : err.response?.data?.message ?? 'Error saving node'
      toast(msg, 'error')
    }
  }

  const loading = create.isPending || update.isPending

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={editingNode ? `Edit: ${editingNode.name}` : 'Add New Node'}
      className="max-w-2xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Node Name *"
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            required
            placeholder="router-main"
          />
          <Select
            label="Type *"
            value={form.type}
            onChange={(e) => set('type', e.target.value as NodeType)}
            options={[
              { value: 'mikrotik', label: 'MikroTik' },
              { value: 'database', label: 'Database' },
            ]}
          />
          <Input
            label="Host / IP *"
            value={form.host}
            onChange={(e) => set('host', e.target.value)}
            required
            placeholder="192.168.1.1"
          />
          <Input
            label="SSH Port"
            type="number"
            min={1}
            max={65535}
            value={form.port}
            onChange={(e) => set('port', Number(e.target.value))}
          />
          <Input
            label="SSH User"
            value={form.ssh_user}
            onChange={(e) => set('ssh_user', e.target.value)}
            placeholder="admin"
          />
          <Input
            label={editingNode ? 'SSH Password (blank = keep)' : 'SSH Password'}
            type="password"
            value={form.ssh_password}
            onChange={(e) => set('ssh_password', e.target.value)}
            placeholder={editingNode ? 'leave blank to keep current' : ''}
          />
          <Input
            label="SSH Key Path"
            value={form.ssh_key_path}
            onChange={(e) => set('ssh_key_path', e.target.value)}
            placeholder="/home/user/.ssh/id_rsa"
            className="sm:col-span-2"
          />
        </div>

        {form.type === 'database' && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-3 border-t border-[#E2E8F0]">
            <Input
              label="Database Name"
              value={form.db_name}
              onChange={(e) => set('db_name', e.target.value)}
              placeholder="mydb"
            />
            <Input
              label="DB User"
              value={form.db_user}
              onChange={(e) => set('db_user', e.target.value)}
              placeholder="root"
            />
            <Input
              label={editingNode ? 'DB Password (blank = keep)' : 'DB Password'}
              type="password"
              value={form.db_password}
              onChange={(e) => set('db_password', e.target.value)}
            />
          </div>
        )}

        <Input
          label="Backup Interval (hours)"
          type="number"
          min={1}
          max={8760}
          value={form.schedule_interval_hours}
          onChange={(e) => set('schedule_interval_hours', Number(e.target.value))}
        />

        <div className="flex flex-col sm:flex-row justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={loading}>
            {editingNode ? 'Update Node' : 'Create Node'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
