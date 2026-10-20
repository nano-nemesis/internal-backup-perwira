import { Outlet, useLocation } from 'react-router-dom'
import { useState } from 'react'
import Sidebar from './Sidebar'
import Topbar from './Topbar'
import BottomNav from './BottomNav'
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
    <div className="flex h-[100dvh] bg-[#F4F5FA] overflow-hidden">
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-[#0F172A]/50 z-30 md:hidden animate-pudar"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Topbar onToggleSidebar={() => setSidebarOpen((v) => !v)} />
        {/* pb di HP: ruang untuk navigasi bawah (56px + padding) supaya baris terakhir tidak tertutup. */}
        <main className="flex-1 overflow-y-auto px-4 pt-2 pb-[calc(6rem+env(safe-area-inset-bottom))] md:px-6 md:pb-6">
          {/* key={pathname}: tanpa ini, state error bertahan setelah pindah halaman —
              teknisi klik menu lain tapi tetap terjebak di layar error. */}
          <ErrorBoundary key={location.pathname}>
            {/* Ganti halaman dengan sedikit gerak naik, bukan berkedip. */}
            <div key={location.pathname} className="animate-masuk">
              <Outlet />
            </div>
          </ErrorBoundary>
        </main>
      </div>
      <BottomNav onLainnya={() => setSidebarOpen(true)} />
      <YangBaru open={baru} onClose={() => setBaru(false)} />
    </div>
  )
}
