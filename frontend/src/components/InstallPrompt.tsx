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
    // HP: lembar dari bawah selebar layar. Desktop: kartu kecil di pojok kiri bawah.
    <div
      role="dialog"
      aria-labelledby="judul-pasang"
      className="fixed z-50 inset-x-0 bottom-0 sm:inset-x-auto sm:left-4 sm:bottom-4 sm:w-[24rem]
                 bg-white rounded-t-[28px] sm:rounded-[22px] px-5 pt-3 sm:pt-5
                 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:pb-5
                 shadow-[0_-20px_40px_-20px_rgba(15,23,42,0.4)] sm:shadow-[0_20px_40px_-16px_rgba(15,23,42,0.35)]
                 flex flex-col gap-4"
    >
      <span aria-hidden="true" className="sm:hidden self-center w-11 h-[5px] rounded-full bg-[#D5D8E2]" />
      <div className="flex items-center gap-3.5">
        <img src="/icon-192.png" alt="" className="w-14 h-14 rounded-2xl border border-[#E2E4EC] flex-shrink-0" />
        <div className="min-w-0 flex-1">
          <h2 id="judul-pasang" className="text-lg font-extrabold text-[#0F172A]">Pasang Perwira Backup</h2>
          <p className="text-[13px] text-[#475569] mt-0.5">Buka langsung dari layar utama, layar penuh.</p>
        </div>
        <button
          onClick={tutup}
          aria-label="Tutup ajakan pasang"
          className="w-11 h-11 rounded-full bg-[#F1F2F7] text-[#334155] hover:text-[#0F172A] transition-colors flex items-center justify-center flex-shrink-0"
        >
          <X className="w-[18px] h-[18px]" />
        </button>
      </div>

      {tersedia ? (
        <div className="flex gap-2.5">
          <button
            onClick={tutup}
            className="flex-1 min-h-[52px] rounded-[14px] border border-[#DADDE8] bg-white text-[15px] font-bold text-[#0F172A] hover:bg-[#F4F5FA] transition-colors"
          >
            Nanti saja
          </button>
          <button
            onClick={pasang}
            className="flex-[1.6] min-h-[52px] rounded-[14px] bg-[#4255F0] hover:bg-[#3442D9] text-white text-[15px] font-bold
                       shadow-[0_12px_24px_-12px_#4255F0CC] transition-colors inline-flex items-center justify-center gap-2"
          >
            <Download className="w-[18px] h-[18px]" />
            Pasang
          </button>
        </div>
      ) : (
        <p className="flex gap-2.5 items-start bg-[#F4F5FA] rounded-[14px] px-3.5 py-3 text-[13px] text-[#334155] leading-relaxed">
          <Share className="w-[18px] h-[18px] mt-0.5 flex-shrink-0 text-[#4255F0]" aria-hidden="true" />
          {LANGKAH_IOS}
        </p>
      )}
    </div>
  )
}
