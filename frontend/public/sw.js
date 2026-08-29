/*
 * Service worker PerwiraBackup.
 *
 * Prinsip utama: KERANGKA APLIKASI boleh di-cache, DATA tidak pernah.
 *
 * Ini dashboard pemantauan. Menyajikan status backup dari cache saat jaringan
 * putus berarti menampilkan keadaan lama seolah keadaan sekarang — persis
 * kesalahan yang sudah dijaga di sisi UI (spanduk "gagal memuat", bukan angka
 * yang menenangkan). Jadi /api dan /sanctum selalu ke jaringan; kalau gagal,
 * biarkan gagal supaya aplikasi menampilkan peringatannya sendiri.
 */

const CACHE = 'perwira-backup-v1'

// Berkas di /assets/ namanya ber-hash isi, jadi aman di-cache selamanya.
const SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/perwiramedia.png',
  '/icon-192.png',
  '/icon-512.png',
]

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((k) => Promise.all(k.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (e) => {
  const { request } = e
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // Data selalu dari jaringan. Jangan pernah disimpan, jangan pernah disajikan basi.
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/sanctum')) return

  // Navigasi: coba jaringan dulu supaya versi terbaru terpakai; kalau offline,
  // sajikan kerangka aplikasi agar pengguna melihat pesan aplikasinya sendiri,
  // bukan halaman dinosaurus peramban.
  if (request.mode === 'navigate') {
    e.respondWith(
      fetch(request).catch(() => caches.match('/index.html', { ignoreSearch: true })),
    )
    return
  }

  // Aset ber-hash: ambil dari cache dulu, lalu simpan yang baru.
  e.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((res) => {
          if (res.ok && res.type === 'basic') {
            const salinan = res.clone()
            caches.open(CACHE).then((c) => c.put(request, salinan))
          }
          return res
        }),
    ),
  )
})
