import { useState } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { Eye, EyeOff, Shield, Clock, Activity } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { Button } from '../components/ui/button'
import logo from '../assets/logo.png'

export default function LoginPage() {
  const { login, user, loading } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (!loading && user) return <Navigate to="/dashboard" replace />

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await login(username, password)
      navigate('/dashboard', { replace: true })
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Login failed. Check your credentials.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen bg-white">
      {/* Left panel - hidden on mobile */}
      <div className="hidden md:flex md:w-1/2 bg-[#0F172A] flex-col items-center justify-center p-12">
        <img src={logo} alt="PerwiraMedia" className="h-20 w-auto mb-6" />
        <h2 className="text-2xl font-display font-bold text-white mb-2 text-center">
          PerwiraBackup
        </h2>
        <p className="text-[#94A3B8] text-sm text-center mb-10">
          Internal Backup Management System
        </p>
        <div className="space-y-4 w-full max-w-xs">
          {[
            { icon: Clock, text: 'Backup otomatis terjadwal' },
            { icon: Activity, text: 'Monitor real-time VPS & nodes' },
            { icon: Shield, text: 'Multi-node support dengan role RBAC' },
          ].map(({ icon: Icon, text }) => (
            <div key={text} className="flex items-center gap-3 text-[#CBD5E1] text-sm">
              <div className="w-8 h-8 rounded-lg bg-[#1E293B] flex items-center justify-center flex-shrink-0">
                <Icon className="w-4 h-4 text-[#0077FF]" />
              </div>
              <span>{text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Right panel - form */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 md:p-12">
        <div className="w-full max-w-sm">
          {/* Logo (shown on mobile) */}
          <div className="flex flex-col items-center mb-8">
            <img src={logo} alt="PerwiraMedia" className="h-10 w-auto mb-3" />
            <h1 className="text-2xl font-display font-bold text-[#0F172A]">
              PerwiraBackup
            </h1>
            <p className="text-sm text-[#64748B] mt-1">
              Internal Backup Management System
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-[#0F172A]">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoFocus
                autoComplete="username"
                placeholder="admin"
                className="w-full px-3 py-2 bg-white border border-[#E2E8F0] rounded-md text-sm text-[#0F172A] placeholder-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#0077FF] focus:border-[#0077FF] transition-colors"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-[#0F172A]">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="w-full px-3 py-2 pr-10 bg-white border border-[#E2E8F0] rounded-md text-sm text-[#0F172A] placeholder-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#0077FF] focus:border-[#0077FF] transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94A3B8] hover:text-[#64748B] transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="px-3 py-2 bg-[#FEF2F0] border border-[#FECACA] rounded-md text-sm text-[#E63000]">
                {error}
              </div>
            )}

            <Button
              type="submit"
              className="w-full justify-center mt-2"
              loading={submitting}
            >
              Sign In
            </Button>
          </form>

          <p className="text-center text-xs text-[#94A3B8] mt-8">
            © PerwiraMedia — Internal Tools
          </p>
        </div>
      </div>
    </div>
  )
}
