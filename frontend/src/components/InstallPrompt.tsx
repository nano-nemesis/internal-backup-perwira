import { useState, useSyncExternalStore } from 'react'
import { Download, X, Share } from 'lucide-react'

/**
 * Ajakan memasang aplikasi ke layar utama.
 *
 * Dua jalur, karena peramban memperlakukannya berbeda:
 *
 *  - Android/Chrome/Edge memancarkan `beforeinstallprompt`. Peristiwa itu HANYA
 *    muncul kalau aplikasi memang bisa dipasang — artinya harus HTTPS. Lewat
 *    http://IP ia tidak akan pernah muncul, dan spanduk ini diam. Begitu TLS
 *    dipasang, tombolnya muncul sendiri tanpa perlu mengubah kode.
 *  - iOS Safari tidak mendukung peristiwa itu sama sekali, tetapi Add to Home
 *    Screen tetap bisa dipakai walau lewat HTTP. Jadi untuk iOS ditampilkan
 *    petunjuk manual.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const KUNCI_TUTUP = 'install-prompt-ditutup'

const sudahTerpasang = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  // Safari iOS memakai properti non-standar ini saat berjalan dari layar utama.
  (window.navigator as { standalone?: boolean }).standalone === true

const iosSafari = () => {
  const ua = window.navigator.userAgent
  const ios = /iPad|iPhone|iPod/.test(ua) ||
    // iPadOS 13+ menyamar sebagai desktop Mac.
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const safari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua)
  return ios && safari
}

// Ditangkap di tingkat modul, bukan di komponen: peristiwanya bisa terpancar
// sebelum React selesai me-mount, dan dipakai dua tempat (spanduk + sidebar).
let tertunda: BeforeInstallPromptEvent | null = null
const pendengar = new Set<() => void>()
const kabari = () => pendengar.forEach((f) => f())
window.addEventListener('beforeinstallprompt', (e) => {
  // Cegah spanduk bawaan supaya tidak muncul dua ajakan sekaligus.
  e.preventDefault()
  tertunda = e as BeforeInstallPromptEvent
  kabari()
})
window.addEventListener('appinstalled', () => { tertunda = null; kabari() })

/**
 * Status pasang: `prompt` = Android/Chrome bisa langsung dipasang, `ios` = perlu
 * langkah manual lewat tombol Bagikan, `null` = sudah terpasang / tidak didukung.
 */
export function usePasang() {
  const e = useSyncExternalStore(
    (f) => { pendengar.add(f); return () => { pendengar.delete(f) } },
    () => tertunda,
  )
  const jenis: 'prompt' | 'ios' | null =
    sudahTerpasang() ? null : e ? 'prompt' : iosSafari() ? 'ios' : null
  const pasang = async () => {
    if (!e) return
    await e.prompt()
    await e.userChoice
    tertunda = null
    kabari()
  }
  return { jenis, pasang }
}

export const LANGKAH_IOS = 'Tekan tombol Bagikan di Safari, lalu pilih “Tambah ke Layar Utama”.'

export function InstallPrompt() {
  const { jenis, pasang } = usePasang()
  const [ditutup, setDitutup] = useState(() => {
    try {
      return !!localStorage.getItem(KUNCI_TUTUP)
    } catch {
      return false // mode private / penyimpanan diblokir — anggap belum pernah ditutup
    }
  })

  const tutup = () => {
    try { localStorage.setItem(KUNCI_TUTUP, '1') } catch { /* abaikan */ }
    setDitutup(true)
  }

  if (ditutup || !jenis) return null
  const tersedia = jenis === 'prompt'

  return (
    <div
      role="dialog"
      aria-label="Pasang aplikasi"
      className="fixed z-40 bottom-[max(1rem,env(safe-area-inset-bottom))] left-4 right-4 sm:right-auto sm:w-[22rem]
                 card p-4 shadow-lg border-l-4 border-l-[#0077FF]"
    >
      <div className="flex items-start gap-3">
        <img src="/icon-192.png" alt="" className="w-10 h-10 rounded-lg flex-shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-display font-semibold text-[#0F172A]">
            Pasang Internal Backup
          </p>
          <p className="text-xs text-[#475569] mt-0.5">
            {tersedia
              ? 'Buka langsung dari layar utama, tanpa bilah alamat.'
              : LANGKAH_IOS}
          </p>

          {tersedia ? (
            <button
              onClick={pasang}
              className="mt-3 inline-flex items-center gap-1.5 px-3 py-2 rounded-md
                         bg-[#0077FF] hover:bg-[#0060CC] text-white text-sm font-medium
                         transition-colors min-h-[40px]"
            >
              <Download className="w-4 h-4" />
              Pasang
            </button>
          ) : (
            <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-[#475569]">
              <Share className="w-3.5 h-3.5 text-[#0077FF]" aria-hidden="true" />
              Bagikan → Tambah ke Layar Utama
            </p>
          )}
        </div>

        <button
          onClick={tutup}
          aria-label="Tutup ajakan pasang"
          className="p-1.5 -m-1 rounded-md text-[#475569] hover:text-[#0F172A]
                     hover:bg-[#F8FAFC] transition-colors flex-shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
