import { useState } from 'react'
import { useRestoreCheck, useSimulateFailure } from '../../hooks/useNodes'
import { useAuth } from '../../context/AuthContext'
import type { BackupFile, CekStatus, RestoreCheckResult, SkenarioGangguan } from '../../types'
import { Button } from '../ui/button'
import { toast } from '../ui/toaster'
import { formatDatetimeWIB } from '../../lib/utils'

const STATUS: Record<CekStatus, { label: string; kelas: string }> = {
  ok: { label: 'OK', kelas: 'text-[#16A34A]' },
  peringatan: { label: 'PERHATIAN', kelas: 'text-amber-600' },
  gagal: { label: 'GAGAL', kelas: 'text-[#DC2626]' },
}

const PUTUSAN: Record<RestoreCheckResult['putusan'], { teks: string; kelas: string }> = {
  siap: { teks: 'Siap di-restore ke perangkat ini', kelas: 'border-[#16A34A] bg-[#F0FDF4] text-[#166534]' },
  perhatian: { teks: 'Bisa di-restore, dengan catatan di bawah', kelas: 'border-amber-500 bg-amber-50 text-amber-800' },
  'tidak-bisa': { teks: 'Tidak bisa di-restore apa adanya', kelas: 'border-[#DC2626] bg-[#FEF2F2] text-[#991B1B]' },
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
  const [pilihan, setPilihan] = useState('')
  // Berkas yang dipilih bisa hilang dimakan retensi; jatuh ke yang terbaru.
  const berkas = kandidat.some((f) => f.filename === pilihan) ? pilihan : kandidat[0]?.filename ?? ''
  const hasil = restore.data

  const jalankanGangguan = async (skenario: SkenarioGangguan, label: string) => {
    if (!confirm(
      `Jalankan simulasi "${label}"?\n\nNotifikasi Telegram sungguhan akan terkirim, dan status node ini merah sampai backup berikutnya berhasil.`,
    )) return
    try {
      await gangguan.mutateAsync({ nodeId, skenario })
      toast('Simulasi masuk antrean — pantau Backup Logs, Log Sistem, dan Telegram', 'info')
    } catch (err: any) {
      toast(err.response?.data?.message ?? 'Gagal memulai simulasi', 'error')
    }
  }

  return (
    <div className="p-4 space-y-8">
      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-[#0F172A]">Simulasi restore</h3>
          <p className="text-sm text-[#475569] mt-1">
            Menilai apakah berkas backup bisa dipulihkan ke perangkat yang terpasang sekarang: keutuhan
            berkas, kecocokan model dan versi RouterOS, lalu langkah restore-nya. Router tidak disentuh.
          </p>
        </div>

        {kandidat.length === 0 ? (
          <p className="text-sm text-[#475569] font-mono">Belum ada berkas .rsc atau .backup.</p>
        ) : (
          <div className="flex flex-col sm:flex-row gap-2">
            <select
              value={berkas}
              onChange={(e) => {
                setPilihan(e.target.value)
                restore.reset()
              }}
              className="flex-1 min-w-0 rounded-md border border-[#E2E8F0] bg-white px-3 py-2 text-sm font-mono text-[#0F172A] min-h-[44px]"
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
          <p className="text-sm text-[#DC2626]">
            {(restore.error as any)?.response?.data?.message ?? 'Gagal memeriksa berkas'}
          </p>
        )}

        {hasil && (
          <div className="space-y-4">
            <div className={`border-l-4 px-3 py-2 text-sm font-medium ${PUTUSAN[hasil.putusan].kelas}`}>
              {PUTUSAN[hasil.putusan].teks}
            </div>

            <ul className="divide-y divide-[#E2E8F0] border border-[#E2E8F0] rounded-md">
              {hasil.cek.map((c) => (
                <li key={c.judul} className="px-3 py-2.5 flex gap-3 text-sm">
                  <span className={`font-mono text-xs w-20 flex-shrink-0 pt-0.5 ${STATUS[c.status].kelas}`}>
                    {STATUS[c.status].label}
                  </span>
                  <div className="min-w-0">
                    <p className="font-medium text-[#0F172A]">{c.judul}</p>
                    <p className="text-[#475569] break-words">{c.detail}</p>
                  </div>
                </li>
              ))}
            </ul>

            <div>
              <h4 className="text-sm font-semibold text-[#0F172A] mb-2">
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
              {hasil.dicek_pada ? formatDatetimeWIB(hasil.dicek_pada) : 'belum pernah — klik "Cek sekarang" di atas'}
            </p>
          </div>
        )}
      </section>

      {isOperator && (
        <section className="space-y-3 pt-6 border-t border-[#E2E8F0]">
          <div>
            <h3 className="text-sm font-semibold text-[#0F172A]">Simulasi gangguan backup</h3>
            <p className="text-sm text-[#475569] mt-1">
              Backup dikirim ke target palsu, bukan ke router ini, sehingga gagal sungguhan. Hasilnya
              tercatat di Backup Logs dan Log Sistem dengan tanda <span className="font-mono">[SIMULASI]</span>,
              notifikasi Telegram terkirim, dan status node merah sampai backup berikutnya berhasil — saat
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
