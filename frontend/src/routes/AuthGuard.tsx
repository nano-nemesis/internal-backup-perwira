import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (!loading && !user) {
      navigate('/login', { replace: true })
    }
  }, [user, loading, navigate])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[100dvh] bg-[#F4F5FA]">
        <div className="text-[#475569] text-sm animate-pulse">
          Memuat...
        </div>
      </div>
    )
  }

  if (!user) return null

  return <>{children}</>
}
