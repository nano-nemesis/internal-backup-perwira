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
        err.response?.data?.message ?? 'Setup failed. Please try again.'
      )
    } finally {
      setLoading(false)
    }
  }

  if (checking) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#0f172a]">
        <div className="text-slate-400 font-mono text-sm animate-pulse">
          Checking setup status...
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-[#0f172a] p-4">
      <div className="w-full max-w-sm card p-8">
        <div className="flex flex-col items-center mb-6">
          <div className="p-3 bg-blue-900/40 border border-blue-800 rounded-full mb-4">
            <Shield className="w-7 h-7 text-blue-400" />
          </div>
          <h1 className="text-xl font-mono font-bold text-white">
            First Time Setup
          </h1>
          <p className="text-xs text-slate-500 mt-1 text-center">
            Create the initial admin account to get started
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
            minLength={8}
            placeholder="min. 8 characters"
          />
          {error && (
            <div className="text-sm text-red-400 font-mono px-3 py-2 bg-red-950/30 border border-red-900 rounded">
              {error}
            </div>
          )}
          <Button
            type="submit"
            className="w-full justify-center"
            loading={loading}
          >
            Create Admin Account
          </Button>
        </form>
      </div>
    </div>
  )
}
