import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import { queryClient } from './lib/queryClient'
import './index.css'
import { pantauVersi } from './lib/versi'

// Service worker didaftarkan vite-plugin-pwa (registerSW.js). Detector versi
// memastikan pengguna tidak tertahan di build lama.
pantauVersi()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>
)
