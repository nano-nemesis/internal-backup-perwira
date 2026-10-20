import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * Menahan crash render supaya tidak memutihkan seluruh halaman.
 *
 * Harus class component: React tidak menyediakan padanan hook untuk
 * getDerivedStateFromError/componentDidCatch.
 *
 * Dipasang dua lapis: di dalam AppShell (sidebar tetap hidup, teknisi masih bisa
 * pindah halaman) dan di App (jaring terakhir untuk /login, /setup, dan crash di
 * shell-nya sendiri).
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Biarkan tetap masuk console, ini satu-satunya jejak untuk mendiagnosa.
    console.error('ErrorBoundary menangkap crash render:', error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div role="alert" className="max-w-2xl mx-auto my-10 card p-6 space-y-4">
        <div>
          <h2 className="text-lg font-bold text-[#0F172A]">
            Halaman ini gagal ditampilkan
          </h2>
          <p className="text-sm text-[#475569] mt-1">
            Ini kesalahan tampilan, <strong>bukan</strong> tanda backup gagal atau node
            hilang. Status backup yang sebenarnya tidak bisa disimpulkan dari layar ini.
          </p>
        </div>

        <pre className="text-xs font-mono bg-[#F1F2F7] text-[#0F172A] p-3 rounded-xl overflow-x-auto">
          {error.message || String(error)}
        </pre>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => this.setState({ error: null })}
            className="px-4 py-2 text-sm font-semibold rounded-[14px] bg-[#4255F0] text-white hover:bg-[#3442D9] min-h-[44px]"
          >
            Coba tampilkan lagi
          </button>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 text-sm font-semibold rounded-[14px] bg-white border border-[#DADDE8] hover:bg-[#F4F5FA] min-h-[44px]"
          >
            Muat ulang halaman
          </button>
        </div>
      </div>
    )
  }
}
