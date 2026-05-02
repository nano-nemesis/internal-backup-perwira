import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Plus, Trash2, Key, Shield } from 'lucide-react'
import {
  useUsers,
  useCreateUser,
  useUpdateUserRole,
  useResetPassword,
  useDeleteUser,
} from '../hooks/useUsers'
import { useAuth } from '../context/AuthContext'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { Dialog } from '../components/ui/dialog'
import { Input } from '../components/ui/input'
import { Select } from '../components/ui/select'
import { toast } from '../components/ui/toaster'
import type { User } from '../types'

const roleOptions = [
  { value: 'admin', label: 'Admin' },
  { value: 'operator', label: 'Operator' },
  { value: 'viewer', label: 'Viewer' },
]

export default function AdminPage() {
  const { isAdmin, user: me } = useAuth()
  const { data, isLoading } = useUsers()
  const createUser = useCreateUser()
  const updateRole = useUpdateUserRole()
  const resetPwd = useResetPassword()
  const deleteUser = useDeleteUser()

  const [showCreate, setShowCreate] = useState(false)
  const [newUser, setNewUser] = useState({
    username: '',
    email: '',
    password: '',
    role: 'viewer',
  })

  const [resetTarget, setResetTarget] = useState<User | null>(null)
  const [newPassword, setNewPassword] = useState('')

  if (!isAdmin) return <Navigate to="/dashboard" replace />

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await createUser.mutateAsync(newUser)
      toast(`User "${newUser.username}" created`, 'success')
      setShowCreate(false)
      setNewUser({ username: '', email: '', password: '', role: 'viewer' })
    } catch (err: any) {
      const msg =
        err.response?.data?.errors
          ? Object.values(err.response.data.errors).flat().join(', ')
          : err.response?.data?.message ?? 'Failed to create user'
      toast(msg, 'error')
    }
  }

  const handleRoleChange = async (user: User, role: string) => {
    try {
      await updateRole.mutateAsync({ id: user.id, role })
      toast('Role updated', 'success')
    } catch {
      toast('Failed to update role', 'error')
    }
  }

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!resetTarget) return
    try {
      await resetPwd.mutateAsync({ id: resetTarget.id, password: newPassword })
      toast(`Password reset for "${resetTarget.username}"`, 'success')
      setResetTarget(null)
      setNewPassword('')
    } catch {
      toast('Failed to reset password', 'error')
    }
  }

  const handleDelete = async (user: User) => {
    if (user.id === me?.id) {
      toast("You can't delete your own account", 'error')
      return
    }
    if (!confirm(`Delete user "${user.username}"?`)) return
    try {
      await deleteUser.mutateAsync(user.id)
      toast(`User "${user.username}" deleted`, 'success')
    } catch {
      toast('Failed to delete user', 'error')
    }
  }

  return (
    <div className="space-y-6 max-w-screen-xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-mono font-bold text-white">
            User Management
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {data?.data?.length ?? 0} users
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="w-4 h-4" />
          Add User
        </Button>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700">
              {['Username', 'Email', 'Role', 'Status', 'Created', 'Actions'].map(
                (h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-xs font-mono text-slate-500 uppercase tracking-wider"
                  >
                    {h}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {(data?.data ?? []).map((user) => (
              <tr key={user.id} className="hover:bg-slate-800/30">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Shield className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                    <span className="font-mono text-slate-200">
                      {user.username}
                    </span>
                    {user.id === me?.id && (
                      <span className="text-xs text-blue-400 font-mono">
                        (you)
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-slate-400 text-xs font-mono">
                  {user.email}
                </td>
                <td className="px-4 py-3">
                  <select
                    value={user.role}
                    onChange={(e) => handleRoleChange(user, e.target.value)}
                    disabled={user.id === me?.id}
                    className="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-slate-300 disabled:opacity-40 focus:outline-none focus:border-blue-500"
                  >
                    {roleOptions.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`text-xs font-mono ${
                      user.is_active ? 'text-emerald-400' : 'text-red-400'
                    }`}
                  >
                    {user.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-500 text-xs font-mono">
                  {user.created_at
                    ? new Date(user.created_at).toLocaleDateString('id-ID')
                    : '—'}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <button
                      title="Reset Password"
                      onClick={() => setResetTarget(user)}
                      className="p-1.5 rounded hover:bg-blue-900/50 text-blue-400 transition-colors"
                    >
                      <Key className="w-3.5 h-3.5" />
                    </button>
                    {user.id !== me?.id && (
                      <button
                        title="Delete"
                        onClick={() => handleDelete(user)}
                        className="p-1.5 rounded hover:bg-red-900/50 text-red-400 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {isLoading && (
          <div className="p-8 text-center text-slate-500 font-mono text-sm animate-pulse">
            Loading...
          </div>
        )}
        {!isLoading && (data?.data?.length ?? 0) === 0 && (
          <div className="p-8 text-center text-slate-500 font-mono text-sm">
            No users found
          </div>
        )}
      </div>

      {/* Create User Dialog */}
      <Dialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="Add New User"
      >
        <form onSubmit={handleCreate} className="space-y-4">
          <Input
            label="Username"
            value={newUser.username}
            onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
            required
            minLength={3}
            autoFocus
          />
          <Input
            label="Email"
            type="email"
            value={newUser.email}
            onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
            required
          />
          <Input
            label="Password"
            type="password"
            value={newUser.password}
            onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
            required
            minLength={8}
            placeholder="min. 8 characters"
          />
          <Select
            label="Role"
            value={newUser.role}
            onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
            options={roleOptions}
          />
          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowCreate(false)}
            >
              Cancel
            </Button>
            <Button type="submit" loading={createUser.isPending}>
              Create User
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog
        open={!!resetTarget}
        onClose={() => {
          setResetTarget(null)
          setNewPassword('')
        }}
        title={`Reset Password: ${resetTarget?.username}`}
      >
        <form onSubmit={handleResetPassword} className="space-y-4">
          <Input
            label="New Password"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            minLength={8}
            placeholder="min. 8 characters"
            autoFocus
          />
          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setResetTarget(null)
                setNewPassword('')
              }}
            >
              Cancel
            </Button>
            <Button type="submit" loading={resetPwd.isPending}>
              Reset Password
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  )
}
