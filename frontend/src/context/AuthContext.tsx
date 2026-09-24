import React, { createContext, useContext, useEffect, useState } from 'react'
import api from '../lib/axios'
import type { User } from '../types'

interface AuthContextValue {
  user: User | null
  loading: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
  isAdmin: boolean
  isOperator: boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/me')
      .then((res) => setUser(res.data.data))
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
  }, [])

  // PWA di HP jarang dimuat ulang — dibuka lagi dari latar belakang saja. Sentuh
  // /me saat kembali aktif supaya sesi (sliding, lihat SESSION_LIFETIME) diperpanjang.
  const masuk = user !== null
  useEffect(() => {
    if (!masuk) return
    const onVisible = () => {
      if (document.visibilityState === 'visible') api.get('/me').catch(() => {})
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [masuk])

  const login = async (username: string, password: string) => {
    await api.get('/sanctum/csrf-cookie', { baseURL: '/' })
    const res = await api.post('/login', { username, password })
    setUser(res.data.data)
  }

  const logout = async () => {
    try {
      await api.post('/logout')
    } catch {
      // ignore errors on logout
    }
    setUser(null)
    window.location.href = '/login'
  }

  const value: AuthContextValue = {
    user,
    loading,
    login,
    logout,
    isAdmin: user?.role === 'admin',
    isOperator: user?.role === 'admin' || user?.role === 'operator',
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
