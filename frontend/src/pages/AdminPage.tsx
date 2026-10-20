import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Plus, Trash2, Key } from 'lucide-react'
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

/** Ambil pesan/validasi dari respons API; jatuh ke pesan cadangan kalau tidak ada. */
function apiMessage(err: unknown, fallback: string): string {
  const res = (err as { response?: { data?: { message?: string; errors?: Record<string, string[]> } } })
    .response?.data
  if (res?.errors) return Object.values(res.errors).flat().join(', ')
  return res?.message ?? fallback
}

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
      toast(`Pengguna "${newUser.username}" dibuat`, 'success')
      setShowCreate(false)
      setNewUser({ username: '', email: '', password: '', role: 'viewer' })
    } catch (err) {
      toast(apiMessage(err, 'Gagal membuat pengguna'), 'error')
    }
  }

  const handleRoleChange = async (user: User, role: string) => {
    try {
      await updateRole.mutateAsync({ id: user.id, role })
      toast('Peran diperbarui', 'success')
    } catch (err) {
      // Server mengirim alasan konkret di sini — mis. penolakan menurunkan admin
      // aktif terakhir. `catch` kosong menggantinya jadi pesan generik yang bikin
      // admin menyangka fiturnya rusak.
      toast(apiMessage(err, 'Gagal mengubah peran'), 'error')
    }
  }

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!resetTarget) return
    try {
      await resetPwd.mutateAsync({ id: resetTarget.id, password: newPassword })
      toast(`Password "${resetTarget.username}" direset`, 'success')
      setResetTarget(null)
      setNewPassword('')
    } catch (err) {
      toast(apiMessage(err, 'Gagal mereset password'), 'error')
    }
  }

  const handleDelete = async (user: User) => {
    if (user.id === me?.id) {
      toast('Akun sendiri tidak bisa dihapus', 'error')
      return
    }
    if (!confirm(`Hapus pengguna "${user.username}"?`)) return
    try {
      await deleteUser.mutateAsync(user.id)
      toast(`Pengguna "${user.username}" dihapus`, 'success')
    } catch (err) {
      toast(apiMessage(err, 'Gagal menghapus pengguna'), 'error')
    }
  }

  return (
    <div className="space-y-5 max-w-screen-2xl">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[28px] leading-tight font-extrabold text-[#0F172A]">
            Pengguna
          </h1>
          <p className="text-sm text-[#475569] mt-1">
            {data?.data?.length ?? 0} akun
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="w-4 h-4" />
          Tambah pengguna
        </Button>
      </div>

      <div className="card overflow-x-auto pt-2">
        <table className="w-full text-sm min-w-[720px]">
          <thead>
            <tr className="border-b border-[#EEF0F6]">
              {['Pengguna', 'Email', 'Peran', 'Status', 'Dibuat', ''].map(
                (h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-xs font-semibold text-[#475569] whitespace-nowrap"
                  >
                    {h}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EEF0F6]">
            {(data?.data ?? []).map((user) => (
              <tr key={user.id} className="hover:bg-[#F8F9FC]">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <span aria-hidden="true" className="w-9 h-9 rounded-full bg-[#E0E3FF] text-[#2E3AC2] text-xs font-bold flex items-center justify-center flex-shrink-0">
                      {user.username.slice(0, 2).toUpperCase()}
                    </span>
                    <span className="font-bold text-[#0F172A]">
                      {user.username}
                    </span>
                    {user.id === me?.id && (
                      <span className="pill bg-[#E0E3FF] text-[#2E3AC2]">Anda</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-[#475569] text-[13px]">
                  {user.email}
                </td>
                <td className="px-4 py-3">
                  <select
                    value={user.role}
                    onChange={(e) => handleRoleChange(user, e.target.value)}
                    disabled={user.id === me?.id}
                    aria-label={`Peran ${user.username}`}
                    className="bg-white border border-[#DADDE8] rounded-xl px-3 min-h-[40px] text-[13px] font-semibold text-[#0F172A] disabled:opacity-50 focus:outline-none focus:border-[#4255F0] focus:ring-4 focus:ring-[#4255F0]/15"
                  >
                    {roleOptions.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3">
                  <span className={`pill ${user.is_active ? 'bg-[#BBF7D0] text-[#14532D]' : 'bg-[#E5E7EB] text-[#374151]'}`}>
                    {user.is_active ? 'Aktif' : 'Nonaktif'}
                  </span>
                </td>
                <td className="px-4 py-3 text-[#475569] text-[13px] whitespace-nowrap">
                  {user.created_at
                    ? new Date(user.created_at).toLocaleDateString('id-ID')
                    : '—'}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <button
                      title="Reset password"
                      aria-label={`Reset password ${user.username}`}
                      onClick={() => setResetTarget(user)}
                      className="w-10 h-10 rounded-xl hover:bg-[#EEF0FE] text-[#2E3AC2] transition-colors flex items-center justify-center"
                    >
                      <Key className="w-4 h-4" />
                    </button>
                    {user.id !== me?.id && (
                      <button
                        title="Hapus"
                        aria-label={`Hapus ${user.username}`}
                        onClick={() => handleDelete(user)}
                        className="w-10 h-10 rounded-xl hover:bg-[#FEE2E2] text-[#B91C1C] transition-colors flex items-center justify-center"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {isLoading && (
          <div className="p-8 text-center text-[#475569] text-sm animate-pulse">
            Memuat...
          </div>
        )}
        {!isLoading && (data?.data?.length ?? 0) === 0 && (
          <div className="p-8 text-center text-[#475569] text-sm">
            Belum ada pengguna
          </div>
        )}
      </div>

      {/* Create User Dialog */}
      <Dialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="Tambah pengguna"
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
            placeholder="minimal 8 karakter"
          />
          <Select
            label="Peran"
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
              Batal
            </Button>
            <Button type="submit" loading={createUser.isPending}>
              Buat pengguna
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
        title={`Reset password ${resetTarget?.username ?? ""}`}
      >
        <form onSubmit={handleResetPassword} className="space-y-4">
          <Input
            label="Password baru"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            minLength={8}
            placeholder="minimal 8 karakter"
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
              Batal
            </Button>
            <Button type="submit" loading={resetPwd.isPending}>
              Reset password
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  )
}
