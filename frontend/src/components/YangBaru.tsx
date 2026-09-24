import { Check } from 'lucide-react'
import { Dialog } from './ui/dialog'
import { rilis } from '../lib/changelog'
import { semver } from '../lib/versi'

const KUNCI = 'versi_terlihat'
const tanggal = (ymd: string) =>
  new Date(ymd + 'T00:00:00Z').toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })

/** Catatan rilis versi ini belum pernah dilihat di perangkat ini. */
export function belumTerlihat() {
  try {
    return localStorage.getItem(KUNCI) !== semver && !!rilis(semver)
  } catch {
    return false // storage diblokir: jangan muncul tiap kali dibuka
  }
}

// Pop-up "Yang baru di vX": otomatis sekali per versi per perangkat (AppShell), bisa dibuka lagi dari sidebar.
export function YangBaru({ open, onClose }: { open: boolean; onClose: () => void }) {
  const r = rilis(semver)
  if (!r) return null
  const tutup = () => {
    try { localStorage.setItem(KUNCI, semver) } catch { /* abaikan */ }
    onClose()
  }
  return (
    <Dialog open={open} onClose={tutup} title={`Yang baru di v${r.versi}`} className="max-w-md">
      <p className="text-sm text-[#475569] -mt-3 mb-4">{r.judul} · {tanggal(r.tanggal)}</p>
      <ul className="space-y-2.5">
        {r.poin.map((p) => (
          <li key={p} className="flex gap-3 text-sm text-[#0F172A]">
            <span className="mt-0.5 grid w-5 h-5 shrink-0 place-items-center rounded-full bg-[#DCFCE7] text-[#16A34A]">
              <Check className="w-3 h-3" strokeWidth={3} />
            </span>
            {p}
          </li>
        ))}
      </ul>
      <button
        onClick={tutup}
        className="mt-5 w-full px-3 py-2.5 rounded-md bg-[#0084FF] hover:bg-[#0060CC] text-white text-sm font-medium transition-colors min-h-[44px]"
      >
        Mantap, lanjut
      </button>
    </Dialog>
  )
}
