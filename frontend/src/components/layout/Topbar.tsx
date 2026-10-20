import { PanelLeft, LogOut } from 'lucide-react'
import { useIsFetching } from '@tanstack/react-query'
import { useAuth } from '../../context/AuthContext'

/**
 * Penanda bahwa halaman memperbarui dirinya sendiri. Titik menyala setiap kali
 * data sedang diambil, supaya pengguna tahu angka di layar hidup — bukan
 * tangkapan lama yang perlu di-refresh.
 */
function LiveDot() {
  const fetching = useIsFetching() > 0
  return (
    <span
      className="hidden sm:flex items-center gap-1.5 h-11 px-3.5 rounded-full bg-white border border-[#E2E4EC] text-xs font-semibold text-[#334155]"
      title="Halaman memperbarui datanya sendiri"
    >
      <span className="relative flex h-2 w-2">
        {fetching && (
          <span className="absolute inline-flex h-full w-full rounded-full bg-[#16A34A] opacity-75 animate-ping" />
        )}
        <span
          className={`relative inline-flex h-2 w-2 rounded-full ${
            fetching ? 'bg-[#16A34A]' : 'bg-[#CBD5E1]'
          }`}
        />
      </span>
      live
    </span>
  )
}

interface TopbarProps {
  onToggleSidebar: () => void
}

const peran: Record<string, string> = { admin: 'Admin', operator: 'Operator', viewer: 'Viewer' }

export default function Topbar({ onToggleSidebar }: TopbarProps) {
  const { user, logout } = useAuth()
  const inisial = (user?.username ?? '?').slice(0, 2).toUpperCase()

  return (
    <header className="flex items-center justify-between gap-3 px-4 md:px-6 pb-2 pt-[max(1rem,env(safe-area-inset-top))] flex-shrink-0">
      {/* Desktop: lipat/buka sidebar. Di HP menu ada di navigasi bawah, jadi cukup logo. */}
      <button
        onClick={onToggleSidebar}
        className="hidden md:flex w-11 h-11 rounded-full bg-white border border-[#E2E4EC] text-[#334155] hover:text-[#0F172A] transition-colors items-center justify-center"
        aria-label="Lipat atau buka sidebar"
      >
        <PanelLeft className="w-[18px] h-[18px]" strokeWidth={1.8} />
      </button>
      <div className="md:hidden flex items-center gap-2 min-w-0">
        <img src="/perwiramedia.png" alt="" className="h-7 w-auto" />
        <span className="font-display font-extrabold text-[15px] truncate">Perwira Backup</span>
      </div>

      <div className="flex items-center gap-2.5">
        <LiveDot />
        <div className="flex items-center gap-2.5 pl-1">
          <span
            aria-hidden="true"
            className="w-10 h-10 rounded-full bg-[#E0E3FF] text-[#2E3AC2] font-bold text-sm flex items-center justify-center"
          >
            {inisial}
          </span>
          <div className="hidden md:flex flex-col leading-tight">
            <span className="text-sm font-bold text-[#0F172A]">{user?.username}</span>
            <span className="text-xs text-[#475569]">{peran[user?.role ?? 'viewer']}</span>
          </div>
        </div>
        <button
          onClick={logout}
          className="w-11 h-11 rounded-full bg-white border border-[#E2E4EC] text-[#334155] hover:bg-[#FEE2E2] hover:text-[#991B1B] hover:border-[#FEE2E2] transition-colors flex items-center justify-center"
          aria-label="Keluar"
          title="Keluar"
        >
          <LogOut className="w-[18px] h-[18px]" strokeWidth={1.8} />
        </button>
      </div>
    </header>
  )
}
