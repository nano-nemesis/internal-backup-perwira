import { Menu, LogOut, User } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'

interface TopbarProps {
  onToggleSidebar: () => void
}

const roleBadge: Record<string, string> = {
  admin: 'bg-purple-50 text-purple-700 border-purple-200',
  operator: 'bg-[#EFF6FF] text-[#0077FF] border-[#BFDBFE]',
  viewer: 'bg-[#F8FAFC] text-[#64748B] border-[#E2E8F0]',
}

export default function Topbar({ onToggleSidebar }: TopbarProps) {
  const { user, logout } = useAuth()

  return (
    <header className="flex items-center justify-between px-4 py-3 bg-white border-b border-[#E2E8F0] shadow-sm flex-shrink-0">
      {/* Left: hamburger */}
      <button
        onClick={onToggleSidebar}
        className="p-2 rounded-md hover:bg-[#F8FAFC] text-[#64748B] hover:text-[#0F172A] transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
        aria-label="Toggle sidebar"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Right: user info + logout */}
      <div className="flex items-center gap-3">
        <div className="hidden md:flex items-center gap-2">
          <User className="w-4 h-4 text-[#64748B]" />
          <span className="text-sm text-[#0F172A] font-medium">{user?.username}</span>
          <span
            className={`text-xs font-medium px-2 py-0.5 rounded border ${
              roleBadge[user?.role ?? 'viewer']
            }`}
          >
            {user?.role}
          </span>
        </div>
        {/* Mobile: just icon */}
        <div className="md:hidden">
          <User className="w-5 h-5 text-[#64748B]" />
        </div>
        <button
          onClick={logout}
          className="p-2 rounded-md hover:bg-[#FEF2F0] text-[#64748B] hover:text-[#E63000] transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
          title="Logout"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </header>
  )
}
