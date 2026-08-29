import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import AppRoutes from './routes/index'
import { Toaster } from './components/ui/toaster'
import { ErrorBoundary } from './components/ErrorBoundary'
import { InstallPrompt } from './components/InstallPrompt'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        {/* Jaring terakhir: /login, /setup, dan crash di AppShell sendiri tidak
            tertangkap boundary yang ada di dalam shell. */}
        <ErrorBoundary>
          <AppRoutes />
        </ErrorBoundary>
        <Toaster />
        {/* Di luar ErrorBoundary: ajakan pasang tidak boleh ikut hilang
            kalau satu halaman gagal dirender. */}
        <InstallPrompt />
      </AuthProvider>
    </BrowserRouter>
  )
}
