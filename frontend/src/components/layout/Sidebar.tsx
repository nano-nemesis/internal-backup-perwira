import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Server, HardDrive, Users, X } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { cn } from '../../lib/utils'
import logo from '../../assets/logo.png'

interface SidebarProps {
  open: boolean
  onClose: () => void
}

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/devices', icon: Server, label: 'Devices' },
  { to: '/backup-files', icon: HardDrive, label: 'Backup Files' },
]

const adminItems = [
  { to: '/admin', icon: Users, label: 'User Management' },
]

export default function Sidebar({ open, onClose }: SidebarProps) {
  const { isAdmin } = useAuth()

  return (
    <aside
      className={cn(
        'fixed inset-y-0 left-0 z-40 w-60 flex flex-col bg-[#0F172A]',
        'transition-transform duration-200',
        open ? 'translate-x-0' : '-translate-x-full',
        'md:relative md:translate-x-0 md:z-auto',
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-[#1E293B] flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <img src={logo} alt="PerwiraMedia" className="h-8 w-auto" />
          <span className="font-display font-bold text-sm text-white truncate">
            PerwiraBackup
          </span>
        </div>
        <button
          onClick={onClose}
          className="md:hidden p-1 rounded text-[#64748B] hover:text-white transition-colors"
          aria-label="Close sidebar"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-4 space-y-0.5 overflow-y-auto">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            onClick={onClose}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-3 rounded-md text-sm transition-colors whitespace-nowrap',
                isActive
                  ? 'bg-[#1E293B] text-white border-l-[3px] border-[#0077FF] pl-[9px]'
                  : 'text-[#CBD5E1] hover:bg-[#1E293B] hover:text-white',
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon className={cn('w-4 h-4 flex-shrink-0', isActive ? 'text-[#0077FF]' : 'text-[#64748B]')} />
                <span>{label}</span>
              </>
            )}
          </NavLink>
        ))}

        {isAdmin && (
          <>
            <div className="pt-4 pb-1 px-3">
              <p className="text-xs text-[#475569] uppercase tracking-wider font-medium">
                Admin
              </p>
            </div>
            {adminItems.map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                onClick={onClose}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 px-3 py-3 rounded-md text-sm transition-colors whitespace-nowrap',
                    isActive
                      ? 'bg-[#1E293B] text-white border-l-[3px] border-[#0077FF] pl-[9px]'
                      : 'text-[#CBD5E1] hover:bg-[#1E293B] hover:text-white',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon className={cn('w-4 h-4 flex-shrink-0', isActive ? 'text-[#0077FF]' : 'text-[#64748B]')} />
                    <span>{label}</span>
                  </>
                )}
              </NavLink>
            ))}
          </>
        )}
      </nav>

      <div className="px-4 py-3 border-t border-[#1E293B] text-xs text-[#475569] flex-shrink-0">
        v1.0.0
      </div>
    </aside>
  )
}
