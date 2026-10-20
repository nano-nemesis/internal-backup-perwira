import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useRestoreCheck, useSimulateFailure } from '../../hooks/useNodes'
import { useAuth } from '../../context/AuthContext'
import type { BackupFile, CekStatus, RestoreCheckResult, SkenarioGangguan } from '../../types'
import { Button } from '../ui/button'
import { toast } from '../ui/toaster'
import { formatDatetimeWIB } from '../../lib/utils'

const STATUS: Record<CekStatus, { label: string; kelas: string }> = {
  ok: { label: 'OK', kelas: 'bg-[#BBF7D0] text-[#14532D]' },
  peringatan: { label: 'Perhatian', kelas: 'bg-[#FEF3C7] text-[#92400E]' },
  gagal: { label: 'Gagal', kelas: 'bg-[#DC2626] text-white' },
}

const PUTUSAN: Record<RestoreCheckResult['putusan'], { teks: string; kelas: string }> = {
  siap: { teks: 'Siap di-restore ke perangkat ini', kelas: 'bg-[#DCFCE7] text-[#14532D]' },
  perhatian: { teks: 'Bisa di-restore, dengan catatan di bawah', kelas: 'bg-[#FEF3C7] text-[#92400E]' },
  'tidak-bisa': { teks: 'Tidak bisa di-restore apa adanya', kelas: 'bg-[#FEE2E2] text-[#991B1B]' },
}

const GANGGUAN: { skenario: SkenarioGangguan; label: string; catatan: string }[] = [
  { skenario: 'tak-terjangkau', label: 'Router tak terjangkau', catatan: '±30 detik' },
  { skenario: 'login-ditolak', label: 'Login SSH ditolak', catatan: 'instan' },
]

export function SimulasiPanel({ nodeId, files }: { nodeId: string; files: BackupFile[] }) {
  const { isOperator } = useAuth()
  const restore = useRestoreCheck()
  const gangguan = useSimulateFailure()

  const kandidat = files.filter((f) => /\.(rsc|backup)$/.test(f.filename))
  // ?berkas= dari menu Berkas Backup: langsung memilih berkas yang diklik di sana.
  const [sp] = useSearchParams()
  const [pilihan, setPilihan] = useState(() => sp.get('berkas') ?? '')
  // Berkas yang dipilih bisa hilang dimakan retensi; jatuh ke yang terbaru.
  const berkas = kandidat.some((f) => f.filename === pilihan) ? pilihan : kandidat[0]?.filename ?? ''
  const hasil = restore.data

  const jalankanGangguan = async (skenario: SkenarioGangguan, label: string) => {
    if (!confirm(
      `Jalankan simulasi "${label}"?\n\nNotifikasi Telegram sungguhan akan terkirim, dan status node ini merah sampai backup berikutnya berhasil.`,
    )) return
    try {
      await gangguan.mutateAsync({ nodeId, skenario })
      toast('Simulasi masuk antrean. Pantau Riwayat, Log Sistem, dan Telegram', 'info')
    } catch (err: any) {
      toast(err.response?.data?.message ?? 'Gagal memulai simulasi', 'error')
    }
  }

  return (
    <div className="p-5 md:p-6 space-y-8">
      <section className="space-y-3">
        <div>
          <h3 className="text-lg font-bold text-[#0F172A]">Simulasi restore</h3>
          <p className="text-sm text-[#475569] mt-1">
            Menilai apakah berkas backup bisa dipulihkan ke perangkat yang terpasang sekarang: keutuhan
            berkas, kecocokan model dan versi RouterOS, lalu langkah restore-nya. Router tidak disentuh.
          </p>
        </div>

        {kandidat.length === 0 ? (
          <p className="text-sm text-[#475569]">Belum ada berkas .rsc atau .backup.</p>
        ) : (
          <div className="flex flex-col sm:flex-row gap-2">
            <select
              value={berkas}
              onChange={(e) => {
                setPilihan(e.target.value)
                restore.reset()
              }}
              className="flex-1 min-w-0 rounded-xl border border-[#DADDE8] bg-white px-3.5 py-2 text-sm font-mono text-[#0F172A] min-h-[44px] focus:outline-none focus:border-[#4255F0] focus:ring-4 focus:ring-[#4255F0]/15"
            >
              {kandidat.map((f) => (
                <option key={f.filename} value={f.filename}>
                  {f.filename}
                </option>
              ))}
            </select>
            <Button onClick={() => restore.mutate({ nodeId, filename: berkas })} loading={restore.isPending}>
              Simulasikan restore
            </Button>
          </div>
        )}

        {restore.isError && (
          <p className="text-sm text-[#991B1B]">
            {(restore.error as any)?.response?.data?.message ?? 'Gagal memeriksa berkas'}
          </p>
        )}

        {hasil && (
          <div className="space-y-4">
            <div role="status" className={`rounded-xl px-4 py-3 text-sm font-bold ${PUTUSAN[hasil.putusan].kelas}`}>
              {PUTUSAN[hasil.putusan].teks}
            </div>

            <ul className="divide-y divide-[#EEF0F6] border-y border-[#EEF0F6]">
              {hasil.cek.map((c) => (
                <li key={c.judul} className="py-3 flex gap-3 text-sm">
                  <span className="w-24 flex-shrink-0">
                    <span className={`pill ${STATUS[c.status].kelas}`}>{STATUS[c.status].label}</span>
                  </span>
                  <div className="min-w-0">
                    <p className="font-bold text-[#0F172A]">{c.judul}</p>
                    <p className="text-[#475569] break-words">{c.detail}</p>
                  </div>
                </li>
              ))}
            </ul>

            <div>
              <h4 className="text-[15px] font-bold text-[#0F172A] mb-2">
                Langkah restore ({hasil.jenis === 'backup' ? '.backup' : '.rsc'})
              </h4>
              <ol className="list-decimal pl-5 space-y-1.5 text-sm text-[#475569] break-words">
                {hasil.langkah.map((l, i) => (
                  <li key={i}>{l}</li>
                ))}
              </ol>
            </div>

            <p className="text-xs text-[#475569]">
              Perangkat terakhir dibaca:{' '}
              {hasil.dicek_pada ? formatDatetimeWIB(hasil.dicek_pada) : 'belum pernah, tekan "Cek sekarang" di atas'}
            </p>
          </div>
        )}
      </section>

      {isOperator && (
        <section className="space-y-3 pt-6 border-t border-[#EEF0F6]">
          <div>
            <h3 className="text-lg font-bold text-[#0F172A]">Simulasi gangguan backup</h3>
            <p className="text-sm text-[#475569] mt-1">
              Backup dikirim ke target palsu, bukan ke router ini, sehingga gagal sungguhan. Hasilnya
              tercatat di Riwayat dan Log Sistem dengan tanda <span className="font-mono">[SIMULASI]</span>,
              notifikasi Telegram terkirim, dan status node merah sampai backup berikutnya berhasil; saat
              itu pesan pemulihan Telegram ikut teruji.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {GANGGUAN.map((g) => (
              <Button
                key={g.skenario}
                variant="warning"
                size="sm"
                disabled={gangguan.isPending}
                onClick={() => jalankanGangguan(g.skenario, g.label)}
              >
                {`${g.label} (${g.catatan})`}
              </Button>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
