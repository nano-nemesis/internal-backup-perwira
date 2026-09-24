import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'path'

// Versi = "<semver>+<build>", mis. "1.1.0+2026.09.24-1405.ab12cd3".
// - semver (package.json) = nomor rilis; naikkan saat rilis + isi src/lib/changelog.ts.
// - build = tanggal build WIB + hash commit; set VERSI_BUILD agar sama untuk seluruh build.
//   Detector versi (src/lib/versi.ts) membandingkan string lengkapnya dengan /version.json.
const SEMVER: string = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version
function namaBuild() {
  if (process.env.VERSI_BUILD) return process.env.VERSI_BUILD
  const t = new Date(Date.now() + 7 * 3600e3).toISOString() // WIB
  let hash = 'lokal'
  try {
    hash = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  } catch {
    /* bukan repo git */
  }
  return `${t.slice(0, 10).replaceAll('-', '.')}-${t.slice(11, 16).replace(':', '')}.${hash}`
}
const VERSI = `${SEMVER}+${namaBuild()}`

// Padanan /_app/version.json milik SvelteKit: berkas versi di akar dist.
const berkasVersi: Plugin = {
  name: 'berkas-versi',
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ version: VERSI }) })
  },
}

export default defineConfig({
  define: { __VERSI__: JSON.stringify(VERSI) },
  plugins: [
    react(),
    berkasVersi,
    VitePWA({
      registerType: 'autoUpdate',
      includeManifestIcons: false, // sudah tercakup globPatterns; hindari entri precache ganda
      injectRegister: 'script-defer', // skrip eksternal: lolos CSP script-src 'self'
      manifest: {
        id: '/',
        name: 'Internal Backup PerwiraMedia',
        short_name: 'Internal Backup',
        description: 'Pemantauan backup router MikroTik dan database PerwiraMedia.',
        lang: 'id',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#EEF2F7',
        theme_color: '#0084FF',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // App shell saja. version.json sengaja tidak ikut: detector versi harus selalu melihat server.
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        // Data (/api, /sanctum, /storage) selalu ke jaringan, tidak pernah dari cache.
        navigateFallbackDenylist: [/^\/api\//, /^\/sanctum\//, /^\/storage\//],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        credentials: true,
      },
      '/sanctum': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        credentials: true,
      },
      '/storage': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
})
