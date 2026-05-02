import { Routes, Route, Navigate } from 'react-router-dom'
import AuthGuard from './AuthGuard'
import LoginPage from '../pages/LoginPage'
import SetupPage from '../pages/SetupPage'
import DashboardPage from '../pages/DashboardPage'
import DevicesPage from '../pages/DevicesPage'
import NodeDetailPage from '../pages/NodeDetailPage'
import AdminPage from '../pages/AdminPage'
import BackupFilesPage from '../pages/BackupFilesPage'
import AppShell from '../components/layout/AppShell'

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/setup" element={<SetupPage />} />
      <Route
        element={
          <AuthGuard>
            <AppShell />
          </AuthGuard>
        }
      >
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/devices" element={<DevicesPage />} />
        <Route path="/devices/:id" element={<NodeDetailPage />} />
        <Route path="/backup-files" element={<BackupFilesPage />} />
        <Route path="/admin" element={<AdminPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}
