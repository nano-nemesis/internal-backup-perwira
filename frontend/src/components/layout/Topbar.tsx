import { Menu, LogOut, User } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'

interface TopbarProps {
  onToggleSidebar: () => void
}

const roleColor: Record<string, string> = {
  admin: 'text-purple-400',
  operator: 'text-blue-400',
  viewer: 'text-slate-400',
}

export default function Topbar({ onToggleSidebar }: TopbarProps) {
  const { user, logout } = useAuth()

  return (
    <header className="flex items-center justify-between px-4 py-3 bg-[#1e293b] border-b border-slate-700 flex-shrink-0">
      <button
        onClick={onToggleSidebar}
        className="p-1.5 rounded hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors"
        aria-label="Toggle sidebar"
      >
        <Menu className="w-5 h-5" />
      </button>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <User className="w-4 h-4 text-slate-500" />
          <span className="text-sm text-slate-300 font-mono">{user?.username}</span>
          <span className={`text-xs font-mono ${roleColor[user?.role ?? 'viewer']}`}>
            [{user?.role}]
          </span>
        </div>
        <button
          onClick={logout}
          className="p-1.5 rounded hover:bg-slate-700 text-slate-400 hover:text-red-400 transition-colors"
          title="Logout"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </header>
  )
}
