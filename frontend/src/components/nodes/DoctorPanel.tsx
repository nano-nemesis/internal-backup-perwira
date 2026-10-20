import { useRunDoctor } from '../../hooks/useNodes'
import type { DoctorCek, DoctorReport, DoctorStatus, Node } from '../../types'
import { Button } from '../ui/button'
import { formatDatetimeWIB } from '../../lib/utils'

export const STATUS_DOCTOR: Record<DoctorStatus, { label: string; pill: string }> = {
  kritis: { label: 'Kritis', pill: 'bg-[#DC2626] text-white' },
  peringatan: { label: 'Perhatian', pill: 'bg-[#FEF3C7] text-[#92400E]' },
  info: { label: 'Info', pill: 'bg-[#E0E3FF] text-[#2E3AC2]' },
  ok: { label: 'OK', pill: 'bg-[#BBF7D0] text-[#14532D]' },
}

// Yang paling perlu ditangani di atas: tak terjangkau, lalu kritis, lalu peringatan.
const bobot = (n: Node) =>
  n.doctor?.galat ? 1e6 : (n.doctor?.ringkasan?.kritis ?? 0) * 1000 + (n.doctor?.ringkasan?.peringatan ?? 0)

/** Dipakai halaman Doctor dan kartu di Dashboard, satu sumber supaya angkanya tak bisa beda. */
export function hitungDoctor(semua: Node[]) {
  const urut = semua.filter((n) => n.type === 'mikrotik').sort((a, b) => bobot(b) - bobot(a))
  return {
    urut,
    kritis: urut.filter((n) => (n.doctor?.ringkasan?.kritis ?? 0) > 0).length,
    perhatian: urut.filter((n) => !n.doctor?.ringkasan?.kritis && (n.doctor?.ringkasan?.peringatan ?? 0) > 0).length,
    sehat: urut.filter((n) => n.doctor?.ringkasan && !n.doctor.ringkasan.kritis && !n.doctor.ringkasan.peringatan).length,
    belum: urut.filter((n) => !n.doctor || n.doctor.galat).length,
  }
}

export function PeranBadges({ peran }: { peran?: string[] }) {
  if (!peran?.length) return null
  return (
    <span className="inline-flex flex-wrap gap-1">
      {peran.map((p) => (
        <span key={p} className="px-2.5 py-0.5 rounded-full border border-[#DADDE8] text-xs font-semibold text-[#334155] whitespace-nowrap">
          {p}
        </span>
      ))}
    </span>
  )
}

function Temuan({ c }: { c: DoctorCek }) {
  return (
    <li className="py-4 flex flex-col sm:flex-row gap-2 sm:gap-4 text-sm">
      <span className="sm:w-24 flex-shrink-0">
        <span className={`pill ${STATUS_DOCTOR[c.status].pill}`}>{STATUS_DOCTOR[c.status].label}</span>
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-bold text-[#0F172A]">
          {c.judul} <span className="text-xs font-normal text-[#475569]">· {c.kategori}</span>
        </p>
        <p className="text-[#475569] mt-0.5 break-words">{c.detail}</p>
        {c.perbaikan && (
          <pre className="mt-2.5 px-4 py-3 rounded-[14px] bg-[#111827] text-[#E2E4EC] text-xs leading-relaxed font-mono overflow-x-auto whitespace-pre">
            {c.perbaikan}
          </pre>
        )}
      </div>
    </li>
  )
}

export function DoctorPanel({ nodeId, laporan, dicek }: { nodeId: string; laporan?: DoctorReport | null; dicek?: string | null }) {
  const doctor = useRunDoctor()
  const cek = laporan?.cek ?? []
  const masalah = cek.filter((c) => c.status !== 'ok')
  const lulus = cek.filter((c) => c.status === 'ok')

  return (
    <div className="p-5 md:p-6 space-y-5">
      <div className="flex flex-col sm:flex-row items-start gap-3">
        <div className="flex-1 min-w-0 space-y-1">
          <p className="text-sm text-[#475569]">
            Membandingkan konfigurasi router dengan standar Perwira. Hanya membaca, perbaikan di
            bawah dijalankan manual di router. Diperbarui otomatis tiap backup berhasil.
          </p>
          <div className="flex items-center gap-2 flex-wrap text-xs text-[#475569]">
            <PeranBadges peran={laporan?.peran} />
            {dicek && <span>diperiksa {formatDatetimeWIB(dicek)}</span>}
          </div>
        </div>
        <Button size="sm" onClick={() => doctor.mutate(nodeId)} loading={doctor.isPending}>
          Periksa sekarang
        </Button>
      </div>

      {laporan?.galat && (
        <p role="alert" className="text-sm text-[#991B1B] bg-[#FEE2E2] rounded-xl px-4 py-3 break-words">
          Router tidak bisa diperiksa: {laporan.galat}
        </p>
      )}

      {!laporan && (
        <p className="text-sm text-[#475569]">Belum pernah diperiksa. Tekan "Periksa sekarang".</p>
      )}

      {laporan?.ringkasan && (
        <div className="flex gap-2 flex-wrap">
          {(['kritis', 'peringatan', 'info', 'ok'] as const).map((s) => (
            <span key={s} className={`pill ${STATUS_DOCTOR[s].pill}`}>
              {laporan.ringkasan![s]} {STATUS_DOCTOR[s].label.toLowerCase()}
            </span>
          ))}
        </div>
      )}

      {masalah.length > 0 && (
        <ul className="divide-y divide-[#EEF0F6] border-y border-[#EEF0F6]">
          {masalah.map((c) => <Temuan key={c.id} c={c} />)}
        </ul>
      )}

      {lulus.length > 0 && (
        <div>
          <h4 className="text-[15px] font-bold text-[#0F172A] mb-2.5">Sudah sesuai standar ({lulus.length})</h4>
          <ul className="space-y-2 text-sm text-[#475569]">
            {lulus.map((c) => (
              <li key={c.id} className="flex gap-2">
                <span className="pill bg-[#BBF7D0] text-[#14532D] self-start">OK</span>
                <span className="min-w-0 break-words">
                  <span className="text-[#0F172A] font-semibold">{c.judul}</span> <span className="text-[13px]">· {c.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
