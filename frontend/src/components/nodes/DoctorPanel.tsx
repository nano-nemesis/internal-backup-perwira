import { useRunDoctor } from '../../hooks/useNodes'
import type { DoctorCek, DoctorReport, DoctorStatus, Node } from '../../types'
import { Button } from '../ui/button'
import { formatDatetimeWIB } from '../../lib/utils'

export const STATUS_DOCTOR: Record<DoctorStatus, { label: string; teks: string }> = {
  kritis: { label: 'KRITIS', teks: 'text-[#DC2626]' },
  peringatan: { label: 'PERHATIAN', teks: 'text-amber-600' },
  info: { label: 'INFO', teks: 'text-[#0077FF]' },
  ok: { label: 'OK', teks: 'text-[#16A34A]' },
}

// Yang paling perlu ditangani di atas: tak terjangkau, lalu kritis, lalu peringatan.
const bobot = (n: Node) =>
  n.doctor?.galat ? 1e6 : (n.doctor?.ringkasan?.kritis ?? 0) * 1000 + (n.doctor?.ringkasan?.peringatan ?? 0)

/** Dipakai halaman Doctor dan kartu di Dashboard — satu sumber supaya angkanya tak bisa beda. */
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
        <span key={p} className="px-1.5 py-0.5 rounded border border-[#E2E8F0] text-[11px] font-mono text-[#475569] whitespace-nowrap">
          {p}
        </span>
      ))}
    </span>
  )
}

function Temuan({ c }: { c: DoctorCek }) {
  return (
    <li className="px-3 py-3 flex flex-col sm:flex-row gap-1 sm:gap-3 text-sm">
      <span className={`font-mono text-xs sm:w-20 flex-shrink-0 pt-0.5 ${STATUS_DOCTOR[c.status].teks}`}>
        {STATUS_DOCTOR[c.status].label}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-[#0F172A]">
          {c.judul} <span className="text-xs font-normal text-[#475569]">· {c.kategori}</span>
        </p>
        <p className="text-[#475569] mt-0.5 break-words">{c.detail}</p>
        {c.perbaikan && (
          <pre className="mt-2 px-3 py-2 rounded-md bg-[#0F172A] text-[#E2E8F0] text-xs font-mono overflow-x-auto whitespace-pre">
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
    <div className="p-4 space-y-4">
      <div className="flex flex-col sm:flex-row items-start gap-3">
        <div className="flex-1 min-w-0 space-y-1">
          <p className="text-sm text-[#475569]">
            Membandingkan konfigurasi router dengan standar Perwira. Hanya membaca — perbaikan di
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
        <p className="text-sm text-[#991B1B] bg-[#FEF2F2] border-l-4 border-[#DC2626] px-3 py-2 break-words">
          Router tidak bisa diperiksa: {laporan.galat}
        </p>
      )}

      {!laporan && (
        <p className="text-sm text-[#475569] font-mono">Belum pernah diperiksa — klik "Periksa sekarang".</p>
      )}

      {laporan?.ringkasan && (
        <div className="flex gap-4 flex-wrap text-sm">
          {(['kritis', 'peringatan', 'info', 'ok'] as const).map((s) => (
            <span key={s} className={STATUS_DOCTOR[s].teks}>
              <span className="font-mono font-semibold">{laporan.ringkasan![s]}</span> {STATUS_DOCTOR[s].label.toLowerCase()}
            </span>
          ))}
        </div>
      )}

      {masalah.length > 0 && (
        <ul className="divide-y divide-[#E2E8F0] border border-[#E2E8F0] rounded-md">
          {masalah.map((c) => <Temuan key={c.id} c={c} />)}
        </ul>
      )}

      {lulus.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-[#0F172A] mb-2">Sudah sesuai standar ({lulus.length})</h4>
          <ul className="space-y-1 text-sm text-[#475569]">
            {lulus.map((c) => (
              <li key={c.id} className="flex gap-2">
                <span className="text-[#16A34A] font-mono text-xs pt-0.5">OK</span>
                <span className="min-w-0 break-words">
                  {c.judul} <span className="text-xs">— {c.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
