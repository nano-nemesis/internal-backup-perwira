import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Server, HardDrive, Users, FileJson, BookOpen, Send, X, Download, Sparkles } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { cn } from '../../lib/utils'
import { semver, build } from '../../lib/versi'
import { usePasang, LANGKAH_IOS } from '../InstallPrompt'
import { YangBaru } from '../YangBaru'

interface SidebarProps {
  open: boolean
  onClose: () => void
}

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/devices', icon: Server, label: 'Devices' },
  { to: '/backup-files', icon: HardDrive, label: 'Backup Files' },
  { to: '/panduan', icon: BookOpen, label: 'Panduan' },
]

const adminItems = [
  // `end` wajib untuk /admin: tanpa itu NavLink mencocokkan secara AWALAN, sehingga
  // "User Management" ikut menyala saat berada di /admin/node-config.
  { to: '/admin', icon: Users, label: 'User Management', end: true },
  { to: '/admin/node-config', icon: FileJson, label: 'Konfigurasi Node' },
  { to: '/admin/telegram', icon: Send, label: 'Bot Telegram' },
]

export default function Sidebar({ open, onClose }: SidebarProps) {
  const { isAdmin } = useAuth()
  const { jenis, pasang } = usePasang()
  const [langkahIos, setLangkahIos] = useState(false)
  const [lihatBaru, setLihatBaru] = useState(false)

  // Menutup laci setelah navigasi hanya masuk akal di HP.
  const closeOnMobile = () => {
    if (window.innerWidth < 768) onClose()
  }

  return (
    <aside
      className={cn(
        'fixed inset-y-0 left-0 z-40 w-60 flex flex-col bg-[#0F172A]',
        // Mode standalone di HP: jangan tertimpa notch / bilah gestur.
        'pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]',
        'transition-all duration-200',
        'md:relative md:z-auto',
        // HP: laci yang menggeser masuk/keluar.
        open ? 'translate-x-0' : '-translate-x-full',
        // Desktop: benar-benar dilipat (lebar 0), bukan sekadar digeser — kalau hanya
        // digeser, ia tetap memakan ruang layout dan tombolnya tampak tidak berfungsi.
        open ? 'md:w-60' : 'md:w-0 md:overflow-hidden',
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-[#1E293B] flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <img src="/perwiramedia.png" alt="PerwiraMedia" className="h-8 w-auto" />
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
            onClick={closeOnMobile}
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
            {adminItems.map(({ to, icon: Icon, label, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                onClick={closeOnMobile}
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

      <div className="px-2 py-2 border-t border-[#1E293B] text-xs text-[#94A3B8] flex-shrink-0 space-y-0.5">
        {jenis && (
          <button
            onClick={() => (jenis === 'prompt' ? pasang() : setLangkahIos((v) => !v))}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm text-[#CBD5E1] hover:bg-[#1E293B] hover:text-white transition-colors whitespace-nowrap"
          >
            <Download className="w-4 h-4 flex-shrink-0 text-[#0084FF]" />
            Pasang ke layar utama
          </button>
        )}
        {jenis === 'ios' && langkahIos && <p className="px-3 pb-2 leading-relaxed">{LANGKAH_IOS}</p>}
        <button
          onClick={() => setLihatBaru(true)}
          title={`build ${build}`}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-[#1E293B] hover:text-white transition-colors whitespace-nowrap tabular-nums"
        >
          <Sparkles className="w-4 h-4 flex-shrink-0" />
          v{semver} · Yang baru
        </button>
      </div>
      <YangBaru open={lihatBaru} onClose={() => setLihatBaru(false)} />
    </aside>
  )
}
