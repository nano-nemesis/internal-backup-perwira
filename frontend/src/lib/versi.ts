// Detector versi: bandingkan versi yang sedang berjalan dengan /version.json di server.
// Beda → hapus semua Cache Storage & copot service worker, lalu muat ulang dari jaringan.
// Dengan begitu pengguna tidak pernah tertahan di versi lama (mis. sw.js lama dari cache).

const KUNCI = 'versi_dipaksa' // versi server yang sudah pernah dicoba dipaksa (anti-loop)

export const versi = __VERSI__
// "1.1.0+2026.09.24-1405.ab12cd3" → nomor rilis untuk pengguna & penanda build untuk dukungan teknis.
export const semver = versi.split('+')[0]
export const build = versi.split('+')[1] ?? ''

let memperbarui = false

async function versiServer(): Promise<string | null> {
  try {
    const r = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' })
    if (!r.ok) return null
    return ((await r.json()) as { version?: string }).version ?? null
  } catch {
    return null // offline / server tidak terjangkau / dev server: coba lagi nanti
  }
}

async function bersihkan() {
  if ('caches' in window) {
    for (const k of await caches.keys()) await caches.delete(k)
  }
  if ('serviceWorker' in navigator) {
    for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister()
  }
}

async function cek() {
  if (memperbarui) return
  const server = await versiServer()
  if (!server || server === versi) return
  // Sudah pernah dipaksa ke versi ini tapi masih tertinggal → jangan loop, tunggu cek berikutnya.
  try {
    if (sessionStorage.getItem(KUNCI) === server) return
    sessionStorage.setItem(KUNCI, server)
  } catch {
    /* storage diblokir: tetap lanjut sekali */
  }
  memperbarui = true
  await bersihkan().catch(() => {})
  location.reload()
}

/** Dipanggil sekali dari main.tsx. */
export function pantauVersi() {
  cek()
  setInterval(cek, 5 * 60 * 1000)
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && cek())
}
