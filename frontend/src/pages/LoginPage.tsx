import { useState } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { Eye, EyeOff, Check, AlertCircle } from 'lucide-react'
import { semver } from '../lib/versi'
import { useAuth } from '../context/AuthContext'
import { Button } from '../components/ui/button'

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
      setError(err.response?.data?.message ?? 'Gagal masuk. Periksa username dan password.')
    } finally {
      setSubmitting(false)
    }
  }

  const fitur = ['Backup .rsc dan .backup terjadwal', 'Doctor: standar keamanan tiap router', 'Simulasi restore sebelum bencana']

  return (
    <div className="min-h-[100dvh] bg-[#E8EAF2] md:p-6 flex items-center justify-center">
      <div className="w-full max-w-[1120px] min-h-[100dvh] md:min-h-0 bg-[#F4F5FA] md:rounded-[28px] p-4 md:p-5 flex flex-col md:flex-row gap-5">
        {/* Panel aksen: hanya desktop. Di HP layar sempit dipakai sepenuhnya untuk formulir. */}
        <section className="hidden md:flex flex-1 min-h-[560px] relative overflow-hidden rounded-[22px] bg-[#4255F0] text-white p-10 flex-col gap-7">
          <svg width="360" height="360" viewBox="0 0 220 220" aria-hidden="true" className="absolute -right-[90px] -bottom-[90px] opacity-20">
            <circle cx="110" cy="110" r="88" fill="none" stroke="#fff" strokeWidth="13" strokeLinecap="round" strokeDasharray="373 553" transform="rotate(135 110 110)" />
            <circle cx="110" cy="110" r="68" fill="none" stroke="#fff" strokeWidth="13" strokeLinecap="round" strokeDasharray="210 428" transform="rotate(135 110 110)" />
            <circle cx="110" cy="110" r="48" fill="none" stroke="#fff" strokeWidth="13" strokeLinecap="round" strokeDasharray="186 302" transform="rotate(135 110 110)" />
          </svg>
          <div className="flex items-center gap-2.5">
            <span className="w-11 h-11 rounded-xl bg-white flex items-center justify-center">
              <img src="/perwiramedia.png" alt="" className="h-7 w-auto" />
            </span>
            <span className="font-extrabold text-lg">Perwira Backup</span>
          </div>
          <div className="mt-auto relative space-y-3.5">
            <h2 className="text-[34px] leading-tight font-extrabold max-w-[420px]">
              Backup, Doctor, dan pemulihan seluruh router Perwira.
            </h2>
            <p className="text-[15px] leading-relaxed text-[#E6E9FF] max-w-[420px]">
              Satu tempat untuk memastikan setiap router punya backup yang utuh, konfigurasi sesuai standar, dan siap dipulihkan.
            </p>
          </div>
          <ul className="relative space-y-3">
            {fitur.map((f) => (
              <li key={f} className="flex items-center gap-3 text-sm font-semibold">
                <span className="w-7 h-7 rounded-lg bg-white text-[#4255F0] flex items-center justify-center flex-shrink-0">
                  <Check className="w-4 h-4" strokeWidth={2.5} />
                </span>
                {f}
              </li>
            ))}
          </ul>
        </section>

        <section className="flex-1 bg-white rounded-[22px] px-6 py-10 md:px-10 md:py-12 flex flex-col justify-center">
          <div className="w-full max-w-[380px] mx-auto flex flex-col gap-6">
            <div className="md:hidden flex items-center gap-2.5">
              <img src="/perwiramedia.png" alt="" className="h-9 w-auto" />
              <span className="font-extrabold text-lg">Perwira Backup</span>
            </div>
            <div>
              <h1 className="text-3xl font-extrabold">Masuk</h1>
              <p className="text-sm text-[#475569] mt-1.5">Gunakan akun yang dibuat admin.</p>
            </div>

            {error && (
              <div role="alert" className="flex items-start gap-2.5 bg-[#FEF2F2] text-[#991B1B] rounded-xl px-3.5 py-3 text-[13px] leading-relaxed">
                <AlertCircle className="w-[18px] h-[18px] mt-px flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <label className="flex flex-col gap-2 text-sm font-semibold">
                Username
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  autoFocus
                  autoComplete="username"
                  autoCapitalize="none"
                  className="w-full h-12 px-4 rounded-xl border border-[#DADDE8] bg-[#F8F9FC] text-[15px] font-medium text-[#0F172A] placeholder-[#94A3B8] focus:outline-none focus:bg-white focus:border-[#4255F0] focus:ring-4 focus:ring-[#4255F0]/15 transition-colors"
                />
              </label>

              <label className="flex flex-col gap-2 text-sm font-semibold">
                Password
                <span className="relative block">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    className="w-full h-12 px-4 rounded-xl border border-[#DADDE8] bg-[#F8F9FC] text-[15px] font-medium text-[#0F172A] placeholder-[#94A3B8] focus:outline-none focus:bg-white focus:border-[#4255F0] focus:ring-4 focus:ring-[#4255F0]/15 transition-colors pr-14"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                    className="absolute right-1 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center text-[#475569] hover:text-[#0F172A] transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-[18px] h-[18px]" /> : <Eye className="w-[18px] h-[18px]" />}
                  </button>
                </span>
              </label>

              <Button type="submit" size="lg" className="w-full justify-center mt-1" loading={submitting}>
                Masuk
              </Button>
            </form>

            <p className="text-[13px] text-[#475569] leading-relaxed">
              Lupa password? Minta admin untuk reset dari menu Pengguna.
            </p>
            <p className="border-t border-[#EEF0F6] pt-4 text-[13px] text-[#475569] font-mono">v{semver}</p>
          </div>
        </section>
      </div>
    </div>
  )
}
