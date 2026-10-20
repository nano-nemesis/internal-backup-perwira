import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Send } from 'lucide-react'
import api from '../lib/axios'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { toast } from '../components/ui/toaster'
import { useAuth } from '../context/AuthContext'
import { useNodes } from '../hooks/useNodes'
import { cn } from '../lib/utils'

interface TelegramSettings {
  token_terisi: boolean
  token_petunjuk: string | null
  token_dari_env: boolean
  chat_id: string
  siap: boolean
  notif: Record<Jenis, boolean>
  jeda_menit: number
  pendengar_detik_lalu: number | null
}

type Jenis = 'gagal' | 'pulih' | 'doctor' | 'sukses'

const NOTIF: [Jenis, string, string?][] = [
  ['gagal', 'Backup gagal', 'dengan sebab yang dikenali'],
  ['pulih', 'Node pulih setelah gagal'],
  ['doctor', 'Doctor menemukan kritis baru', 'hanya temuan yang baru muncul sejak pemeriksaan sebelumnya'],
  ['sukses', 'Setiap backup berhasil', 'ramai, tidak disarankan untuk grup'],
]

const JEDA = [15, 30, 60, 180]
const labelJeda = (m: number) => (m % 60 === 0 ? `${m / 60} jam` : `${m} menit`)

function apiMessage(err: unknown, fallback: string): string {
  const res = (err as { response?: { data?: { message?: string; errors?: Record<string, string[]> } } })
    .response?.data
  if (res?.errors) return Object.values(res.errors).flat().join(', ')
  return res?.message ?? fallback
}

export default function TelegramPage() {
  const { isAdmin } = useAuth()
  const qc = useQueryClient()
  const { data: nodesData } = useNodes()

  const { data, isLoading } = useQuery<{ data: TelegramSettings }>({
    queryKey: ['telegram-settings'],
    queryFn: () => api.get('/admin/telegram').then((r) => r.data),
    // Detak pendengar perintah berubah terus; segarkan supaya status di atas tidak basi.
    refetchInterval: 30_000,
  })

  const simpan = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.put('/admin/telegram', body).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['telegram-settings'] }),
  })
  const uji = useMutation({
    mutationFn: () => api.post('/admin/telegram/test').then((r) => r.data),
  })

  // Nilai yang sedang diubah menimpa nilai server; null = belum disentuh.
  const [gantiToken, setGantiToken] = useState(false)
  const [token, setToken] = useState('')
  const [chatId, setChatId] = useState<string | null>(null)
  const [notifUbah, setNotifUbah] = useState<Partial<Record<Jenis, boolean>>>({})
  const [jedaUbah, setJedaUbah] = useState<number | null>(null)

  if (!isAdmin) return <Navigate to="/dashboard" replace />

  const s = data?.data
  const chatValue = chatId ?? s?.chat_id ?? ''
  const notif = (j: Jenis) => notifUbah[j] ?? s?.notif?.[j] ?? true
  const jeda = jedaUbah ?? s?.jeda_menit ?? 30
  const pilihanJeda = JEDA.includes(jeda) ? JEDA : [...JEDA, jeda].sort((a, b) => a - b)

  const handleSimpan = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await simpan.mutateAsync({
        bot_token: token || undefined,
        chat_id: chatValue,
        notif: Object.fromEntries(NOTIF.map(([j]) => [j, notif(j)])),
        jeda_menit: jeda,
      })
      setToken('')
      setGantiToken(false)
      setChatId(null)
      setNotifUbah({})
      setJedaUbah(null)
      toast('Pengaturan Telegram disimpan', 'success')
    } catch (err) {
      toast(apiMessage(err, 'Gagal menyimpan'), 'error')
    }
  }

  const handleUji = async () => {
    try {
      const res = await uji.mutateAsync()
      toast(res.message ?? 'Pesan uji terkirim', 'success')
    } catch (err) {
      toast(apiMessage(err, 'Pesan uji gagal'), 'error')
    }
  }

  // Pendengar perintah berdetak tiap long-poll (≤ 65 detik); lewat 3 menit berarti service-nya mati.
  const mendengar = s?.pendengar_detik_lalu != null && s.pendengar_detik_lalu < 180
  const [statusTeks, statusGaya, statusTitik] = !s
    ? ['Memuat…', 'bg-[#E5E7EB] text-[#374151]', 'bg-[#94A3B8]']
    : !s.siap
      ? ['Belum lengkap: isi token dan chat ID', 'bg-[#FEF3C7] text-[#92400E]', 'bg-[#D97706]']
      : mendengar
        ? ['Bot aktif, mendengarkan perintah', 'bg-[#BBF7D0] text-[#14532D]', 'bg-[#15803D]']
        : ['Notifikasi siap, tapi pendengar perintah tidak berjalan', 'bg-[#FEF3C7] text-[#92400E]', 'bg-[#D97706]']

  const stats = nodesData?.stats
  const jam = new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' })
  const kode = 'font-mono text-[12px] bg-[#F1F2F7] px-1 rounded'

  return (
    <div className="space-y-5 max-w-screen-2xl">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] leading-tight font-extrabold text-[#0F172A]">Bot Telegram</h1>
          <p className="text-sm text-[#475569] mt-1">Notifikasi backup dan perintah baca saja dari grup NOC</p>
        </div>
        <span role="status" className={cn('flex items-center gap-2 text-[13px] font-bold px-3.5 py-2 rounded-full', statusGaya)}>
          <span className={cn('w-2 h-2 rounded-full', statusTitik, mendengar && 'animate-pulse')} />
          {statusTeks}
        </span>
      </header>

      {isLoading ? (
        <div className="card p-5 text-sm text-[#475569] animate-pulse">Memuat…</div>
      ) : (
        <div className="flex flex-wrap gap-5 items-start">
          <form onSubmit={handleSimpan} className="card flex-[3_1_480px] min-w-0 p-5 md:p-6 flex flex-col gap-5">
            <h2 className="text-lg font-bold">Pengaturan</h2>

            <div className="flex flex-col gap-2">
              <span className="text-[13px] font-semibold">Token bot</span>
              {s?.token_terisi && !gantiToken ? (
                <div className="flex gap-2.5 flex-wrap items-center">
                  <span className="flex-[1_1_240px] h-11 flex items-center px-3.5 rounded-xl bg-[#F8F9FC] border border-[#DADDE8] font-mono text-sm text-[#334155] truncate">
                    {s.token_petunjuk}
                  </span>
                  <Button type="button" variant="secondary" onClick={() => setGantiToken(true)}>Ganti token</Button>
                </div>
              ) : (
                <div className="flex gap-2.5 flex-wrap items-center">
                  <div className="flex-[1_1_240px]">
                    <Input
                      aria-label="Token bot"
                      type="password"
                      autoComplete="off"
                      autoFocus={gantiToken}
                      value={token}
                      onChange={(e) => setToken(e.target.value)}
                      placeholder="dari @BotFather, mis. 123456:AAE…"
                      className="font-mono"
                    />
                  </div>
                  {s?.token_terisi && (
                    <Button type="button" variant="ghost" onClick={() => { setGantiToken(false); setToken('') }}>Batal</Button>
                  )}
                </div>
              )}
              <span className="text-xs text-[#475569]">
                {s?.token_dari_env
                  ? 'Token saat ini berasal dari .env. Mengganti di sini akan menimpanya.'
                  : 'Token tidak pernah dikirim ulang ke browser, hanya petunjuk bertopeng.'}
              </span>
            </div>

            <label className="flex flex-col gap-2 text-[13px] font-semibold">
              Chat ID grup
              <input
                value={chatValue}
                onChange={(e) => setChatId(e.target.value)}
                inputMode="numeric"
                placeholder="-1001234567890"
                className="h-11 px-3.5 rounded-xl border border-[#DADDE8] bg-[#F8F9FC] font-mono text-sm text-[#0F172A] focus:outline-none focus:bg-white focus:border-[#4255F0] focus:ring-4 focus:ring-[#4255F0]/15"
              />
              <span className="text-xs font-medium text-[#475569] leading-relaxed">
                Bot hanya menjawab di chat ini; pesan dari chat lain diabaikan. ID grup biasanya diawali tanda minus:
                tambahkan bot ke grup, kirim satu pesan, lalu buka <code className={kode}>api.telegram.org/bot&lt;token&gt;/getUpdates</code>.
              </span>
            </label>

            <fieldset className="flex flex-col">
              <legend className="text-[13px] font-semibold mb-2">Kirim notifikasi saat</legend>
              {NOTIF.map(([j, judul, ket], i) => (
                <label
                  key={j}
                  className={cn('flex justify-between items-center gap-3 min-h-[52px] py-2 text-sm cursor-pointer', i < NOTIF.length - 1 && 'border-b border-[#EEF0F6]')}
                >
                  <span>
                    {judul}
                    {ket && <span className="block text-xs text-[#475569]">{ket}</span>}
                  </span>
                  <input
                    type="checkbox"
                    checked={notif(j)}
                    onChange={(e) => setNotifUbah((u) => ({ ...u, [j]: e.target.checked }))}
                    className="w-[22px] h-[22px] accent-[#4255F0] cursor-pointer flex-shrink-0"
                  />
                </label>
              ))}
            </fieldset>

            <label className="flex items-center justify-between gap-3 text-sm font-semibold flex-wrap">
              Jeda notifikasi gagal per node
              <select value={jeda} onChange={(e) => setJedaUbah(Number(e.target.value))} className="pilih">
                {pilihanJeda.map((m) => <option key={m} value={m}>{labelJeda(m)}</option>)}
              </select>
            </label>

            <div className="flex gap-2.5 justify-end flex-wrap border-t border-[#EEF0F6] pt-4">
              <Button type="button" variant="secondary" onClick={handleUji} loading={uji.isPending} disabled={!s?.siap}>
                <Send className="w-4 h-4" />
                Kirim pesan uji
              </Button>
              <Button type="submit" loading={simpan.isPending}>Simpan</Button>
            </div>
          </form>

          {/* Pratinjau mengikuti format pesan bot yang sebenarnya (TelegramNotifier / TelegramBot). */}
          <section aria-label="Pratinjau pesan bot" className="flex-[2_1_340px] min-w-0 bg-[#DCE5EE] rounded-[20px] p-4 md:p-[18px] flex flex-col gap-3 text-[13px] leading-relaxed">
            <div className="flex items-center gap-2.5 bg-white rounded-[14px] px-3 py-2.5">
              <span className="w-9 h-9 rounded-full bg-[#4255F0] text-white font-extrabold text-[13px] flex items-center justify-center">PB</span>
              <div>
                <div className="font-bold text-sm">Grup NOC</div>
                <div className="text-xs text-[#475569]">Pratinjau pesan bot · contoh</div>
              </div>
            </div>
            <div className="self-start max-w-[92%] bg-white rounded-[16px_16px_16px_4px] px-3.5 py-3 shadow-[0_1px_1px_rgba(15,23,42,0.08)] animate-masuk">
              <p className="font-extrabold">❌ Backup Gagal</p>
              <p className="mt-1.5">📦 Node: <code className={kode}>RMT-SG-03</code> · mikrotik<br />🖥 Host: <code className={kode}>198.51.100.31</code></p>
              <p className="mt-2"><b>💡 Kemungkinan sebab:</b><br />Perangkat tidak menjawab — kemungkinan mati, sibuk, atau terhalang firewall</p>
              <p className="mt-2 text-[#475569]">📅 Sukses terakhir: 20 Oct 2026 01:02 WIB<br /><i>/node RMT-SG-03 untuk detail</i></p>
              <p className="mt-1 text-right text-[11px] text-[#64748B]">{jam}</p>
            </div>
            <div className="self-end bg-[#E7FFDB] rounded-[16px_16px_4px_16px] px-3.5 py-2.5 font-mono animate-masuk [animation-delay:120ms]">/status</div>
            <div className="self-start max-w-[92%] bg-white rounded-[16px_16px_16px_4px] px-3.5 py-3 animate-masuk [animation-delay:240ms]">
              <p className="font-extrabold">📊 PerwiraBackup</p>
              <p className="mt-1.5">
                Node: <b>{stats?.total ?? 39}</b> total<br />
                ✅ {stats?.success ?? 35} sukses · ❌ {stats?.failed ?? 2} gagal
              </p>
            </div>
            <div className="bg-white rounded-[14px] px-3.5 py-3">
              <p className="font-bold mb-2">Perintah tersedia</p>
              <div className="flex flex-wrap gap-1.5 font-mono text-xs">
                {['/status', '/gagal', '/vps', '/node nama', '/help'].map((c) => (
                  <span key={c} className="bg-[#F1F2F7] px-2 py-1 rounded-lg">{c}</span>
                ))}
              </div>
              <p className="text-xs text-[#475569] mt-2">
                Bot hanya membaca. Perintah dilayani service <code className={kode}>backup-telegram</code> di VPS.
              </p>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
