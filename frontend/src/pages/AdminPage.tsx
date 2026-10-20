import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Plus, Trash2 } from 'lucide-react'
import {
  useUsers,
  useCreateUser,
  useUpdateUserRole,
  useResetPassword,
  useDeleteUser,
  useUpdateUserStatus,
} from '../hooks/useUsers'
import { useAuth } from '../context/AuthContext'
import { Button } from '../components/ui/button'
import { Dialog } from '../components/ui/dialog'
import { Input } from '../components/ui/input'
import { Select } from '../components/ui/select'
import { toast } from '../components/ui/toaster'
import type { User } from '../types'
import { cn, kapan } from '../lib/utils'
import { Hitung } from '../components/ui/hitung'

const PERAN = [
  { k: 'admin', label: 'Admin', ket: 'Semua akses: ubah dan hapus node, pengguna, konfigurasi node, Telegram, Log Sistem, terminal.' },
  { k: 'operator', label: 'Operator', ket: 'Tambah node, jalankan backup, unduh berkas, simulasi gangguan.' },
  { k: 'viewer', label: 'Viewer', ket: 'Lihat status, log backup, dan Doctor. Tidak bisa mengunduh isi berkas.' },
] as const

// Warna avatar tetap per nama, supaya orang yang sama selalu berwarna sama.
const AVATAR = [
  'bg-[#E0E3FF] text-[#2E3AC2]',
  'bg-[#FFEDD5] text-[#9A3412]',
  'bg-[#CCFBF1] text-[#115E59]',
  'bg-[#EDE9FE] text-[#5B21B6]',
  'bg-[#F1F2F7] text-[#334155]',
]
const avatar = (u: User) =>
  u.is_active ? AVATAR[[...u.username].reduce((h, c) => h + c.charCodeAt(0), 0) % AVATAR.length] : 'bg-[#F1F2F7] text-[#475569]'

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
  const updateStatus = useUpdateUserStatus()

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
      // Server mengirim alasan konkret di sini, mis. penolakan menurunkan admin
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

  const handleStatus = async (user: User) => {
    const aktif = !user.is_active
    if (!aktif && !confirm(`Nonaktifkan "${user.username}"? Sesinya langsung terputus dan ia tidak bisa login sampai diaktifkan lagi.`)) return
    try {
      await updateStatus.mutateAsync({ id: user.id, is_active: aktif })
      toast(`"${user.username}" ${aktif ? 'diaktifkan' : 'dinonaktifkan'}`, 'success')
    } catch (err) {
      toast(apiMessage(err, 'Gagal mengubah status'), 'error')
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

  const users = data?.data ?? []
  const tombol = 'min-h-[40px] px-3.5 rounded-[10px] text-[13px] font-semibold transition-colors whitespace-nowrap'

  const aksi = (user: User) => (
    <div className="flex items-center gap-1.5 justify-end flex-wrap">
      {/* Akun sendiri: peran dan status dikunci, tapi password tetap bisa diganti. */}
      <button onClick={() => setResetTarget(user)} className={cn(tombol, 'bg-[#EEF0FE] text-[#2E3AC2] hover:bg-[#E0E3FF]')}>
        Reset password
      </button>
      {user.id !== me?.id && (
        <button
          onClick={() => handleStatus(user)}
          disabled={updateStatus.isPending}
          className={cn(tombol, user.is_active
            ? 'border border-[#FECACA] bg-white text-[#B91C1C] hover:bg-[#FEF2F2]'
            : 'bg-[#EEF0FE] text-[#2E3AC2] hover:bg-[#E0E3FF]')}
        >
          {user.is_active ? 'Nonaktifkan' : 'Aktifkan'}
        </button>
      )}
      {/* Hapus hanya untuk akun nonaktif: nonaktifkan dulu, hapus kemudian. */}
      {user.id !== me?.id && !user.is_active && (
        <button
          onClick={() => handleDelete(user)}
          aria-label={`Hapus ${user.username}`}
          title="Hapus"
          className="w-10 h-10 rounded-[10px] border border-[#FECACA] bg-white text-[#B91C1C] hover:bg-[#FEF2F2] flex items-center justify-center transition-colors"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      )}
    </div>
  )

  const peran = (user: User) =>
    user.id === me?.id ? (
      <span className="pill bg-[#EDE9FE] text-[#5B21B6]">{roleOptions.find((r) => r.value === user.role)?.label}</span>
    ) : (
      <select
        value={user.role}
        onChange={(e) => handleRoleChange(user, e.target.value)}
        aria-label={`Peran ${user.username}`}
        className="pilih"
      >
        {roleOptions.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
      </select>
    )

  const status = (user: User) => (
    <span className={cn('pill', user.is_active ? 'bg-[#BBF7D0] text-[#14532D]' : 'bg-[#E5E7EB] text-[#374151]')}>
      {user.is_active ? 'Aktif' : 'Nonaktif'}
    </span>
  )

  const identitas = (user: User) => (
    <div className="flex items-center gap-3 min-w-0">
      <span aria-hidden="true" className={cn('w-[38px] h-[38px] rounded-full text-[13px] font-bold flex items-center justify-center flex-shrink-0', avatar(user))}>
        {user.username.slice(0, 2).toUpperCase()}
      </span>
      <div className="min-w-0">
        <div className={cn('font-bold truncate', !user.is_active && 'text-[#475569]')}>{user.username}</div>
        <div className="text-xs text-[#475569] truncate">{user.id === me?.id ? `Kamu · ${user.email}` : user.email}</div>
      </div>
    </div>
  )

  return (
    <div className="space-y-5 max-w-screen-2xl">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[28px] leading-tight font-extrabold text-[#0F172A]">Pengguna</h1>
          <p className="text-sm text-[#475569] mt-1">
            {users.length} akun · password minimal 12 karakter, huruf dan angka
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="w-4 h-4" />
          Tambah pengguna
        </Button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-5 berurutan">
        {PERAN.map((p, i) => (
          <section
            key={p.k}
            className={cn('rounded-[20px] p-5 flex flex-col gap-2', i === 0 ? 'bg-[#4255F0] text-white shadow-[0_12px_24px_-12px_#4255F0CC]' : 'bg-white')}
          >
            <div className="flex justify-between items-center">
              <h2 className="text-base font-bold">{p.label}</h2>
              <span className="text-[26px] leading-none font-extrabold"><Hitung n={users.filter((u) => u.role === p.k).length} /></span>
            </div>
            <p className={cn('text-[13px] leading-relaxed', i === 0 ? 'text-[#E6E9FF]' : 'text-[#475569]')}>{p.ket}</p>
          </section>
        ))}
      </div>

      {isLoading && <div className="card p-8 text-center text-[#475569] text-sm animate-pulse">Memuat...</div>}
      {!isLoading && users.length === 0 && <div className="card p-8 text-center text-[#475569] text-sm">Belum ada pengguna</div>}

      {users.length > 0 && (
        <>
          {/* HP: kartu per akun */}
          <div className="md:hidden space-y-3 berurutan">
            {users.map((user) => (
              <div key={user.id} className="card p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  {identitas(user)}
                  {status(user)}
                </div>
                <div className="flex items-center justify-between gap-3 text-[13px] text-[#475569]">
                  {peran(user)}
                  <span className="text-right">Login terakhir<br /><span className="font-semibold text-[#334155]">{user.last_login_at ? kapan(user.last_login_at) : 'Belum tercatat'}</span></span>
                </div>
                {aksi(user)}
              </div>
            ))}
          </div>

          <section className="card hidden md:block overflow-x-auto px-2 pt-1 pb-3">
            <table className="w-full text-sm min-w-[760px]">
              <thead>
                <tr>
                  <th className="th">Pengguna</th>
                  <th className="th">Peran</th>
                  <th className="th">Status</th>
                  <th className="th">Login terakhir</th>
                  <th className="th"><span className="sr-only">Aksi</span></th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-t border-[#EEF0F6]">
                    <td className="px-3 py-3 max-w-[280px]">{identitas(user)}</td>
                    <td className="px-3 py-3">{peran(user)}</td>
                    <td className="px-3 py-3">{status(user)}</td>
                    <td className="px-3 py-3 text-[#475569] whitespace-nowrap">{user.last_login_at ? kapan(user.last_login_at) : 'Belum tercatat'}</td>
                    <td className="px-3 py-2">{aksi(user)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}

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
            minLength={12}
            placeholder="minimal 12 karakter, huruf dan angka"
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
            minLength={12}
            placeholder="minimal 12 karakter, huruf dan angka"
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
