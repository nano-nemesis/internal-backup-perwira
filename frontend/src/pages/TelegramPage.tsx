import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Send, KeyRound, CheckCircle2, AlertCircle } from 'lucide-react'
import api from '../lib/axios'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { toast } from '../components/ui/toaster'
import { useAuth } from '../context/AuthContext'

interface TelegramSettings {
  token_terisi: boolean
  token_petunjuk: string | null
  token_dari_env: boolean
  chat_id: string
  siap: boolean
}

function apiMessage(err: unknown, fallback: string): string {
  const res = (err as { response?: { data?: { message?: string; errors?: Record<string, string[]> } } })
    .response?.data
  if (res?.errors) return Object.values(res.errors).flat().join(', ')
  return res?.message ?? fallback
}

export default function TelegramPage() {
  const { isAdmin } = useAuth()
  const qc = useQueryClient()

  const { data, isLoading } = useQuery<{ data: TelegramSettings }>({
    queryKey: ['telegram-settings'],
    queryFn: () => api.get('/admin/telegram').then((r) => r.data),
  })

  const simpan = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.put('/admin/telegram', body).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['telegram-settings'] }),
  })
  const uji = useMutation({
    mutationFn: () => api.post('/admin/telegram/test').then((r) => r.data),
  })

  const [token, setToken] = useState('')
  const [chatId, setChatId] = useState<string | null>(null)

  if (!isAdmin) return <Navigate to="/dashboard" replace />

  const s = data?.data
  const chatValue = chatId ?? s?.chat_id ?? ''

  const handleSimpan = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await simpan.mutateAsync({ bot_token: token || undefined, chat_id: chatValue })
      setToken('')
      setChatId(null)
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

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-display font-bold text-[#0F172A]">Bot Telegram</h1>
        <p className="text-sm text-[#475569] mt-1">
          Notifikasi backup dan perintah cek keadaan lewat Telegram.
        </p>
      </div>

      {isLoading ? (
        <div className="card p-5 text-sm text-[#475569]">Memuat…</div>
      ) : (
        <>
          {/* Status ringkas */}
          <div
            className={`card p-4 flex items-start gap-3 ${
              s?.siap ? 'border-l-4 border-l-[#16A34A]' : 'border-l-4 border-l-amber-400'
            }`}
          >
            {s?.siap ? (
              <CheckCircle2 className="w-5 h-5 text-[#16A34A] flex-shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            )}
            <div className="text-sm">
              <p className="font-medium text-[#0F172A]">
                {s?.siap ? 'Telegram aktif' : 'Belum lengkap'}
              </p>
              <p className="text-[#475569] mt-0.5">
                {s?.siap
                  ? 'Notifikasi backup dikirim ke chat ini, dan bot menjawab perintah dari chat yang sama.'
                  : 'Isi Token Bot dan Chat ID agar notifikasi serta perintah bot berfungsi.'}
              </p>
              {s?.token_dari_env && (
                <p className="text-[#475569] mt-1">
                  Token saat ini berasal dari <code className="font-mono text-xs">.env</code>.
                  Mengisi kolom di bawah akan menimpanya.
                </p>
              )}
            </div>
          </div>

          <form onSubmit={handleSimpan} className="card p-5 space-y-4">
            <div>
              <Input
                label="Token Bot"
                type="password"
                autoComplete="off"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder={
                  s?.token_terisi ? `tersimpan: ${s.token_petunjuk}` : 'dari @BotFather, mis. 123456:AAE…'
                }
              />
              <p className="text-xs text-[#475569] mt-1.5">
                {s?.token_terisi
                  ? 'Biarkan kosong kalau tidak ingin mengubah token yang sudah tersimpan.'
                  : 'Buat bot lewat @BotFather di Telegram, lalu tempel tokennya di sini.'}
              </p>
            </div>

            <div>
              <Input
                label="Chat ID"
                value={chatValue}
                onChange={(e) => setChatId(e.target.value)}
                placeholder="-1001234567890"
              />
              <p className="text-xs text-[#475569] mt-1.5">
                ID grup biasanya diawali tanda minus. Tambahkan bot ke grup, kirim satu pesan,
                lalu buka{' '}
                <code className="font-mono text-xs">
                  api.telegram.org/bot&lt;token&gt;/getUpdates
                </code>{' '}
                untuk melihat ID-nya.
              </p>
            </div>

            <div className="flex flex-wrap gap-3 pt-1">
              <Button type="submit" loading={simpan.isPending}>
                <KeyRound className="w-4 h-4" />
                Simpan
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={handleUji}
                loading={uji.isPending}
                disabled={!s?.siap}
              >
                <Send className="w-4 h-4" />
                Kirim pesan uji
              </Button>
            </div>
          </form>

          <div className="card p-5 space-y-2">
            <h2 className="text-sm font-display font-semibold text-[#0F172A]">
              Perintah yang bisa dikirim ke bot
            </h2>
            <ul className="text-sm text-[#475569] space-y-1">
              {[
                ['/status', 'ringkasan armada + kapasitas VPS'],
                ['/gagal', 'node yang gagal beserta pesan errornya'],
                ['/vps', 'CPU, RAM, disk partisi backup, load'],
                ['/node <nama>', 'detail satu node'],
                ['/help', 'daftar perintah'],
              ].map(([cmd, ket]) => (
                <li key={cmd} className="flex gap-2">
                  <code className="font-mono text-xs bg-[#F1F5F9] text-[#0F172A] px-1.5 py-0.5 rounded flex-shrink-0">
                    {cmd}
                  </code>
                  <span>— {ket}</span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-[#475569] pt-1">
              Bot hanya <strong>membaca</strong>, dan hanya menjawab di chat ber-ID di atas.
              Perintahnya dilayani service <code className="font-mono">backup-telegram</code> di VPS.
            </p>
          </div>
        </>
      )}
    </div>
  )
}
