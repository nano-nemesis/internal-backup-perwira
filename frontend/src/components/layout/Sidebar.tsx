import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Server, HardDrive, Users, FileJson, BookOpen, Send, ScrollText, X, Download, Sparkles, Stethoscope, type LucideIcon } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useNodes } from '../../hooks/useNodes'
import { cn } from '../../lib/utils'
import { semver, build } from '../../lib/versi'
import { usePasang, LANGKAH_IOS } from '../InstallPrompt'
import { YangBaru } from '../YangBaru'
import { hitungDoctor } from '../nodes/DoctorPanel'

interface SidebarProps {
  open: boolean
  onClose: () => void
}

interface Item {
  to: string
  icon: LucideIcon
  label: string
  end?: boolean
}

const menu: Item[] = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/devices', icon: Server, label: 'Perangkat' },
  { to: '/backup-files', icon: HardDrive, label: 'Berkas Backup' },
  { to: '/doctor', icon: Stethoscope, label: 'Doctor' },
]

const alat: Item[] = [
  { to: '/panduan', icon: BookOpen, label: 'Panduan' },
]

const admin: Item[] = [
  // `end` wajib untuk /admin: tanpa itu NavLink mencocokkan secara AWALAN, sehingga
  // "Pengguna" ikut menyala saat berada di /admin/node-config.
  { to: '/admin', icon: Users, label: 'Pengguna', end: true },
  { to: '/admin/node-config', icon: FileJson, label: 'Konfigurasi Node' },
  { to: '/admin/telegram', icon: Send, label: 'Bot Telegram' },
  { to: '/admin/log', icon: ScrollText, label: 'Log Sistem' },
]

function Bagian({ judul, items, onPilih, hitung }: {
  judul: string
  items: Item[]
  onPilih: () => void
  hitung?: Record<string, number>
}) {
  return (
    <div className="flex flex-col gap-1">
      <p className="px-3 pb-1.5 text-[11px] font-bold tracking-[0.08em] text-[#475569]">{judul}</p>
      {items.map(({ to, icon: Icon, label, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={onPilih}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 px-3 py-3 rounded-[14px] text-sm transition-colors whitespace-nowrap',
              isActive
                ? 'bg-[#4255F0] text-white font-semibold shadow-[0_12px_24px_-12px_#4255F0CC]'
                : 'text-[#334155] font-medium hover:bg-[#F1F2F7]',
            )
          }
        >
          {({ isActive }) => (
            <>
              <Icon className="w-[18px] h-[18px] flex-shrink-0" strokeWidth={1.8} />
              <span className="flex-1">{label}</span>
              {!!hitung?.[to] && (
                <span
                  className={cn(
                    'pill text-[11px]',
                    isActive ? 'bg-white/20 text-white' : 'bg-[#FEE2E2] text-[#991B1B]',
                  )}
                >
                  {hitung[to]}
                </span>
              )}
            </>
          )}
        </NavLink>
      ))}
    </div>
  )
}

export default function Sidebar({ open, onClose }: SidebarProps) {
  const { isAdmin } = useAuth()
  const { data } = useNodes()
  const { jenis, pasang } = usePasang()
  const [langkahIos, setLangkahIos] = useState(false)
  const [lihatBaru, setLihatBaru] = useState(false)
  const kritis = hitungDoctor(data?.data ?? []).kritis

  // Menutup laci setelah navigasi hanya masuk akal di HP.
  const closeOnMobile = () => {
    if (window.innerWidth < 768) onClose()
  }

  return (
    <aside
      className={cn(
        'fixed inset-y-0 left-0 z-40 w-[260px] flex flex-col bg-white',
        // Mode standalone di HP: jangan tertimpa notch / bilah gestur.
        'pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]',
        'transition-all duration-200',
        // Desktop: kartu putih melayang di atas latar abu, bukan pita gelap selebar layar.
        'md:relative md:z-auto md:inset-auto md:my-4 md:ml-4 md:rounded-[22px] md:pt-0 md:pb-0 md:pl-0',
        // HP: laci yang menggeser masuk/keluar.
        open ? 'translate-x-0' : '-translate-x-full',
        // Desktop: benar-benar dilipat (lebar 0), bukan sekadar digeser, kalau hanya
        // digeser, ia tetap memakan ruang layout dan tombolnya tampak tidak berfungsi.
        open ? 'md:w-[248px]' : 'md:w-0 md:ml-0 md:overflow-hidden',
      )}
    >
      <div className="flex items-center justify-between px-5 pt-5 pb-4 flex-shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <img src="/perwiramedia.png" alt="" className="h-8 w-auto" />
          <span className="font-display font-extrabold text-base text-[#0F172A] truncate">
            Perwira Backup
          </span>
        </div>
        <button
          onClick={onClose}
          className="md:hidden w-11 h-11 -mr-2 flex items-center justify-center rounded-full text-[#334155] hover:bg-[#F1F2F7] transition-colors"
          aria-label="Tutup menu"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <nav aria-label="Menu utama" className="flex-1 px-3 pb-4 space-y-5 overflow-y-auto">
        <Bagian judul="MENU" items={menu} onPilih={closeOnMobile} hitung={{ '/doctor': kritis }} />
        <Bagian judul="ALAT" items={isAdmin ? [admin[3], ...alat] : alat} onPilih={closeOnMobile} />
        {isAdmin && <Bagian judul="ADMIN" items={admin.slice(0, 3)} onPilih={closeOnMobile} />}
      </nav>

      <div className="px-3 pb-4 pt-2 text-xs text-[#475569] flex-shrink-0 space-y-1">
        {jenis && (
          <button
            onClick={() => (jenis === 'prompt' ? pasang() : setLangkahIos((v) => !v))}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-[14px] text-sm font-medium text-[#334155] hover:bg-[#F1F2F7] transition-colors whitespace-nowrap"
          >
            <Download className="w-[18px] h-[18px] flex-shrink-0 text-[#4255F0]" strokeWidth={1.8} />
            Pasang ke layar utama
          </button>
        )}
        {jenis === 'ios' && langkahIos && <p className="px-3 pb-2 leading-relaxed">{LANGKAH_IOS}</p>}
        <button
          onClick={() => setLihatBaru(true)}
          title={`build ${build}`}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-[14px] hover:bg-[#F1F2F7] hover:text-[#0F172A] transition-colors whitespace-nowrap tabular-nums"
        >
          <Sparkles className="w-[18px] h-[18px] flex-shrink-0" strokeWidth={1.8} />
          v{semver} · Yang baru
        </button>
      </div>
      <YangBaru open={lihatBaru} onClose={() => setLihatBaru(false)} />
    </aside>
  )
}
