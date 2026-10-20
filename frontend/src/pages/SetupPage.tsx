import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Shield } from 'lucide-react'
import api from '../lib/axios'
import { Input } from '../components/ui/input'
import { Button } from '../components/ui/button'

export default function SetupPage() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ username: '', email: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    api.get('/setup/status')
      .then((r) => {
        if (r.data.has_users) navigate('/login', { replace: true })
      })
      .finally(() => setChecking(false))
  }, [navigate])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await api.post('/setup', form)
      navigate('/login', { replace: true })
    } catch (err: any) {
      setError(
        err.response?.data?.message ?? 'Setup gagal. Coba lagi.'
      )
    } finally {
      setLoading(false)
    }
  }

  if (checking) {
    return (
      <div className="flex items-center justify-center min-h-[100dvh] bg-[#F4F5FA]">
        <div className="text-[#475569] text-sm animate-pulse">
          Memeriksa status setup...
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-center min-h-[100dvh] bg-[#E8EAF2] p-4">
      <div className="w-full max-w-sm card rounded-[22px] p-6 md:p-8">
        <div className="flex flex-col items-center mb-6">
          <span className="w-14 h-14 rounded-2xl bg-[#4255F0] text-white flex items-center justify-center mb-4 shadow-[0_12px_24px_-12px_#4255F0CC]">
            <Shield className="w-7 h-7" strokeWidth={1.8} />
          </span>
          <h1 className="text-2xl font-extrabold text-[#0F172A]">
            Setup pertama
          </h1>
          <p className="text-sm text-[#475569] mt-1 text-center">
            Buat akun admin pertama untuk mulai memakai Perwira Backup.
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Username"
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
            required
            autoFocus
            minLength={3}
            placeholder="admin"
          />
          <Input
            label="Email"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            required
            placeholder="admin@perwira.local"
          />
          <Input
            label="Password"
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            required
            minLength={12}
            placeholder="minimal 12 karakter, huruf dan angka"
          />
          {error && (
            <div role="alert" className="text-sm text-[#991B1B] px-3.5 py-3 bg-[#FEE2E2] rounded-xl">
              {error}
            </div>
          )}
          <Button
            type="submit"
            size="lg"
            className="w-full justify-center"
            loading={loading}
          >
            Buat akun admin
          </Button>
        </form>
      </div>
    </div>
  )
}
