import { useEffect, useState } from 'react'
import { Check, Loader2, Square, X } from 'lucide-react'
import type { Node } from '../../types'
import { cn } from '../../lib/utils'
import { TAHAP, urutanTahap, type Keadaan } from '../../lib/prosesBackup'

/** Detik sejak `iso`, berdetak tiap detik selama `jalan`. */
function useDetik(iso: string | null | undefined, jalan: boolean) {
  const [sekarang, setSekarang] = useState(() => Date.now())
  useEffect(() => {
    if (!jalan) return
    const t = setInterval(() => setSekarang(Date.now()), 1000)
    return () => clearInterval(t)
  }, [jalan])
  return iso ? Math.max(0, Math.round((sekarang - Date.parse(iso)) / 1000)) : null
}

const waktu = (d: number) => (d < 60 ? `${d} dtk` : `${Math.floor(d / 60)} mnt ${d % 60} dtk`)

/**
 * Proses backup secara langsung: tahap demi tahap, dengan waktu berjalan.
 * `ringkas` untuk panel kecil (satu baris tahap + bar), selain itu daftar tahap lengkap.
 */
export function ProsesBackup({ node, k, ringkas, biasanya, onBatal, membatalkan }: {
  node: Pick<Node, 'type' | 'backup_binary' | 'name'>
  k: Keadaan
  ringkas?: boolean
  /** Durasi backup berhasil yang biasa (detik), untuk perkiraan. */
  biasanya?: number | null
  /** Ada = tombol Batalkan tampil selama backup berjalan (bukan saat masih antre). */
  onBatal?: () => void
  membatalkan?: boolean
}) {
  const urutan = urutanTahap(node)
  const selesai = k.fase === 'selesai'
  const batal = selesai && k.log.status === 'cancelled'
  const gagal = selesai && !k.berhasil && !batal
  // Gagal: backend meninggalkan tahap terakhir yang dicapai, jadi kegagalannya bisa ditunjuk.
  const titikGagal = gagal ? Math.max(1, urutan.indexOf(k.log.tahap ?? '')) : -1
  // Dibatalkan: berhenti di tahap yang sedang jalan saat itu, tanpa tanda gagal.
  const ke = gagal ? titikGagal
    : batal ? Math.max(1, urutan.indexOf(k.log.tahap ?? ''))
      : selesai ? urutan.length : Math.max(0, urutan.indexOf(k.tahap))
  const detik = useDetik(k.log?.started_at ?? k.log?.created_at, !selesai)
  const durasi: number | null = selesai ? k.log.duration_seconds ?? null : detik
  // Bar maju per tahap; tahap yang sedang jalan dihitung setengah, supaya tidak pernah tampak 100% sebelum selesai.
  const persen = batal ? Math.round((ke / urutan.length) * 100) : selesai ? 100 : Math.round(((ke + 0.5) / urutan.length) * 100)

  const judul = !selesai
    ? (k.tahap === 'antre' ? 'Backup menunggu giliran' : 'Backup berjalan')
    : k.berhasil ? 'Backup berhasil' : batal ? 'Backup dibatalkan' : 'Backup gagal'

  return (
    <div role="status" aria-live="polite" className={cn('flex flex-col', ringkas ? 'gap-2' : 'gap-4')}>
      {/* flex-wrap + tombol w-full di ponsel: tombol Batalkan turun ke baris sendiri, judul tidak terjepit. */}
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={cn(
            'flex-shrink-0 rounded-full flex items-center justify-center',
            ringkas ? 'w-8 h-8' : 'w-10 h-10',
            !selesai ? 'bg-[#E0E3FF] text-[#2E3AC2]'
              : k.berhasil ? 'bg-[#BBF7D0] text-[#14532D] animate-muncul'
                : batal ? 'bg-[#E5E7EB] text-[#374151] animate-muncul' : 'bg-[#FEE2E2] text-[#991B1B] animate-muncul',
          )}
        >
          {!selesai ? <Loader2 className="w-[18px] h-[18px] animate-spin" />
            : k.berhasil ? <Check className="w-5 h-5" strokeWidth={2.5} />
              : batal ? <Square className="w-4 h-4" strokeWidth={2.5} /> : <X className="w-5 h-5" strokeWidth={2.5} />}
        </span>
        <div className="min-w-0 flex-1">
          <p className={cn('font-bold truncate', ringkas ? 'text-sm' : 'text-base')}>
            {ringkas ? node.name : judul}
          </p>
          <p className="text-[13px] text-[#475569] truncate">
            {selesai
              ? gagal ? 'Lihat tab Riwayat untuk pesan errornya'
                : batal ? `${k.log.error_message ?? 'Dibatalkan'} Berhenti setelah ${waktu(durasi ?? 0)}.`
                  : `Selesai dalam ${waktu(durasi ?? 0)}`
              : TAHAP[k.tahap] ?? k.tahap}
          </p>
        </div>
        {!selesai && durasi !== null && (
          <span className="text-[13px] font-semibold text-[#334155] tabular-nums flex-shrink-0">{waktu(durasi)}</span>
        )}
        {!selesai && onBatal && k.tahap !== 'antre' && (
          <button
            onClick={onBatal}
            disabled={membatalkan}
            className="w-full sm:w-auto flex-shrink-0 min-h-[40px] px-3.5 rounded-xl border border-[#FECACA] bg-white text-[#991B1B] text-[13px] font-semibold hover:bg-[#FEF2F2] disabled:opacity-50"
          >
            {membatalkan ? 'Menghentikan…' : 'Batalkan'}
          </button>
        )}
      </div>

      <div className="h-2 rounded-full bg-[#EEF0F6] overflow-hidden" aria-hidden="true">
        <div
          className={cn(
            'h-full rounded-full transition-[width] duration-700 ease-out relative overflow-hidden',
            gagal ? 'bg-[#DC2626]' : batal ? 'bg-[#94A3B8]' : selesai ? 'bg-[#16A34A]' : 'bg-[#4255F0]',
          )}
          style={{ width: `${persen}%` }}
        >
          {!selesai && <span className="absolute inset-0 kilau" />}
        </div>
      </div>

      {!ringkas && (
        <ol className="grid gap-2 sm:grid-cols-[repeat(auto-fit,minmax(150px,1fr))]">
          {urutan.map((t, i) => {
            const lewat = i < ke
            const kini = i === ke && !selesai
            const gagalDiSini = i === titikGagal
            return (
              <li key={t} className="flex items-start gap-2.5 text-[13px]">
                <span
                  className={cn(
                    'mt-0.5 w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 transition-colors duration-300',
                    lewat && !gagalDiSini ? 'bg-[#4255F0] text-white' : kini ? 'bg-[#E0E3FF] text-[#2E3AC2]' : gagalDiSini ? 'bg-[#DC2626] text-white' : 'bg-[#EEF0F6] text-[#94A3B8]',
                  )}
                >
                  {lewat && !gagalDiSini ? <Check className="w-3 h-3" strokeWidth={3} />
                    : kini ? <span className="w-2 h-2 rounded-full bg-[#4255F0] animate-pulse" />
                      : <span className="text-[10px] font-bold">{i + 1}</span>}
                </span>
                <span className={cn(kini ? 'font-bold text-[#0F172A]' : lewat ? 'text-[#334155]' : 'text-[#64748B]')}>
                  {TAHAP[t]}
                </span>
              </li>
            )
          })}
        </ol>
      )}

      {!ringkas && !selesai && biasanya ? (
        <p className="text-xs text-[#475569]">Biasanya selesai dalam sekitar {waktu(biasanya)}. Halaman ini memperbarui dirinya sendiri.</p>
      ) : null}
    </div>
  )
}
