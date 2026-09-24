import { Outlet, useLocation } from 'react-router-dom'
import { useState } from 'react'
import Sidebar from './Sidebar'
import Topbar from './Topbar'
import { ErrorBoundary } from '../ErrorBoundary'
import { YangBaru, belumTerlihat } from '../YangBaru'

export default function AppShell() {
  // Awalnya terbuka di desktop, tertutup di HP. Kalau selalu false, tombol hamburger
  // di desktop tidak terlihat berefek apa-apa karena sidebar dipaksa tampil lewat
  // kelas md: — itu sebabnya tombolnya terasa 'tidak berfungsi'.
  const [sidebarOpen, setSidebarOpen] = useState(
    () => typeof window !== 'undefined' && window.innerWidth >= 768,
  )
  const location = useLocation()
  // Catatan rilis tampil sekali per versi per perangkat, setelah login.
  const [baru, setBaru] = useState(belumTerlihat)

  return (
    <div className="flex h-screen bg-[#F8FAFC] overflow-hidden">
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Topbar onToggleSidebar={() => setSidebarOpen((v) => !v)} />
        <main className="flex-1 overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:p-6">
          {/* key={pathname}: tanpa ini, state error bertahan setelah pindah halaman —
              teknisi klik menu lain tapi tetap terjebak di layar error. */}
          <ErrorBoundary key={location.pathname}>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
      <YangBaru open={baru} onClose={() => setBaru(false)} />
    </div>
  )
}
