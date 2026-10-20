import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Server, Stethoscope, HardDrive, Menu } from 'lucide-react'
import { cn } from '../../lib/utils'

const items = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Beranda' },
  { to: '/devices', icon: Server, label: 'Perangkat' },
  { to: '/doctor', icon: Stethoscope, label: 'Doctor' },
  { to: '/backup-files', icon: HardDrive, label: 'Berkas' },
]

const gaya = 'flex-1 flex flex-col items-center justify-center gap-0.5 min-h-[56px] text-[11px]'

function Ikon({ aktif, children }: { aktif: boolean; children: ReactNode }) {
  return (
    <span className={cn('w-[52px] h-[30px] rounded-full flex items-center justify-center', aktif && 'bg-[#E0E3FF]')}>
      {children}
    </span>
  )
}

/** Navigasi utama di HP. "Lainnya" membuka laci sidebar yang memuat menu sisanya. */
export default function BottomNav({ onLainnya }: { onLainnya: () => void }) {
  return (
    <nav
      aria-label="Navigasi utama"
      className="md:hidden fixed inset-x-0 bottom-0 z-30 flex bg-white rounded-t-[22px] px-1.5 pt-2
                 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-10px_24px_-18px_rgba(15,23,42,0.35)]"
    >
      {items.map(({ to, icon: Icon, label }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            cn(gaya, isActive ? 'text-[#2E3AC2] font-bold' : 'text-[#475569] font-semibold')
          }
        >
          {({ isActive }) => (
            <>
              <Ikon aktif={isActive}><Icon className="w-5 h-5" strokeWidth={1.8} /></Ikon>
              {label}
            </>
          )}
        </NavLink>
      ))}
      <button type="button" onClick={onLainnya} className={cn(gaya, 'text-[#475569] font-semibold')}>
        <Ikon aktif={false}><Menu className="w-5 h-5" strokeWidth={1.8} /></Ikon>
        Lainnya
      </button>
    </nav>
  )
}
