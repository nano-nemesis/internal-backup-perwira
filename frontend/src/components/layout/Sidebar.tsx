import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Server, Users, Shield } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { cn } from '../../lib/utils'

interface SidebarProps {
  open: boolean
}

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/devices', icon: Server, label: 'Devices' },
]

const adminItems = [
  { to: '/admin', icon: Users, label: 'User Management' },
]

export default function Sidebar({ open }: SidebarProps) {
  const { isAdmin } = useAuth()

  return (
    <aside
      className={cn(
        'flex flex-col bg-[#1e293b] border-r border-slate-700 flex-shrink-0 transition-all duration-200 overflow-hidden',
        open ? 'w-56' : 'w-0'
      )}
    >
      <div className="flex items-center gap-2.5 px-4 py-5 border-b border-slate-700 flex-shrink-0">
        <Shield className="text-blue-400 w-5 h-5 flex-shrink-0" />
        <span className="font-mono font-semibold text-sm text-white truncate">
          PerwiraBackup
        </span>
      </div>

      <nav className="flex-1 px-2 py-4 space-y-0.5 overflow-y-auto">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors whitespace-nowrap',
                isActive
                  ? 'bg-blue-900/50 text-blue-300 border border-blue-800'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              )
            }
          >
            <Icon className="w-4 h-4 flex-shrink-0" />
            <span>{label}</span>
          </NavLink>
        ))}

        {isAdmin && (
          <>
            <div className="pt-4 pb-1 px-3">
              <p className="text-xs font-mono text-slate-500 uppercase tracking-wider">
                Admin
              </p>
            </div>
            {adminItems.map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors whitespace-nowrap',
                    isActive
                      ? 'bg-blue-900/50 text-blue-300 border border-blue-800'
                      : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                  )
                }
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                <span>{label}</span>
              </NavLink>
            ))}
          </>
        )}
      </nav>

      <div className="px-4 py-3 border-t border-slate-700 text-xs text-slate-600 font-mono flex-shrink-0">
        v1.0.0
      </div>
    </aside>
  )
}
