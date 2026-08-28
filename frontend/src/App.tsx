import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import AppRoutes from './routes/index'
import { Toaster } from './components/ui/toaster'
import { ErrorBoundary } from './components/ErrorBoundary'

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
      </AuthProvider>
    </BrowserRouter>
  )
}
