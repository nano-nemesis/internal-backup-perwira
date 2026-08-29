import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import { queryClient } from './lib/queryClient'
import './index.css'

// Service worker hanya tersedia di konteks aman (HTTPS atau localhost). Di
// http://IP objeknya tidak ada sama sekali, jadi penjagaan ini membuat aplikasi
// tetap berjalan normal tanpa PWA — bukan gagal.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .catch((e) => console.warn('Service worker tidak terdaftar:', e))
  })
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>
)
