import type { ReactNode } from 'react'
import { ArrowDown, ChevronDown, Globe, Router as RouterIcon, Shield, type LucideIcon } from 'lucide-react'
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

/** Arti tiap tingkat, supaya "kritis" dan "perhatian" tidak ditebak-tebak. */
export function ArtiStatus() {
  const arti: [DoctorStatus, string][] = [
    ['kritis', 'bisa dimanfaatkan dari internet sekarang, atau pelanggan sudah terganggu. Perbaiki hari ini.'],
    ['peringatan', 'menyimpang dari standar, belum berbahaya langsung. Jadwalkan perbaikannya.'],
    ['info', 'catatan saja, boleh dibiarkan kalau memang disengaja.'],
  ]
  return (
    <ul className="grid gap-1.5 text-[13px] text-[#475569]">
      {arti.map(([s, teks]) => (
        <li key={s} className="flex items-start gap-2">
          <span className={`pill ${STATUS_DOCTOR[s].pill} w-[78px] justify-center flex-shrink-0`}>{STATUS_DOCTOR[s].label}</span>
          <span className="pt-0.5">{teks}</span>
        </li>
      ))}
    </ul>
  )
}

type Jalur = NonNullable<DoctorCek['jalur']>
type Layanan = Jalur['layanan'][number]

const TITIK = {
  merah: 'bg-[#DC2626]', kuning: 'bg-[#D97706]', hijau: 'bg-[#16A34A]', biru: 'bg-[#4255F0]', abu: 'bg-[#94A3B8]',
}

function keadaan(l: Layanan, nanti: boolean): [keyof typeof TITIK, string] {
  if (l.nanti === 'vpn') return ['biru', 'terbuka, dipakai VPN pelanggan']
  if (nanti && l.nanti === 'noc') return ['hijau', 'hanya dari NOC']
  if (nanti && l.nanti === 'tutup') return ['abu', 'tertutup']
  return l.kini === 'dibatasi' ? ['kuning', 'hanya alamat tertentu'] : ['merah', 'terbuka untuk siapa saja']
}

function Simpul({ icon: Icon, children, gelap }: { icon: LucideIcon; children: ReactNode; gelap?: boolean }) {
  return (
    <div className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] ${gelap ? 'bg-[#111827] text-white' : 'bg-white border border-[#DADDE8] text-[#0F172A]'}`}>
      <Icon className="w-4 h-4 flex-shrink-0" strokeWidth={1.8} />
      <span className="min-w-0 break-words">{children}</span>
    </div>
  )
}

function Panah({ children, merah }: { children: ReactNode; merah?: boolean }) {
  return (
    <div className="flex items-center gap-2 pl-4 py-1">
      <ArrowDown className={`w-4 h-4 flex-shrink-0 ${merah ? 'text-[#DC2626]' : 'text-[#94A3B8]'}`} strokeWidth={2} />
      <span className={`text-xs ${merah ? 'text-[#991B1B] font-semibold' : 'text-[#475569]'}`}>{children}</span>
    </div>
  )
}

/** Alur dari internet ke layanan router: kondisi sekarang di kiri, setelah perintah perbaikan di kanan. */
function GambarJalur({ jalur }: { jalur: Jalur }) {
  const panel = (nanti: boolean) => (
    <div className={`rounded-2xl p-3.5 ${nanti ? 'bg-[#F0FDF4]' : 'bg-[#FEF2F2]'}`}>
      <p className={`text-xs font-bold uppercase tracking-[0.04em] mb-2.5 ${nanti ? 'text-[#14532D]' : 'text-[#991B1B]'}`}>
        {nanti ? 'Setelah perbaikan' : 'Sekarang'}
      </p>
      <Simpul icon={Globe}>Internet, siapa saja</Simpul>
      {nanti ? (
        <>
          <Panah>semua lalu lintas masuk</Panah>
          <Simpul icon={Shield} gelap>
            {jalur.gerbang}
          </Simpul>
          <Panah>hanya yang diizinkan</Panah>
        </>
      ) : (
        <Panah merah>langsung masuk, tidak ada yang menyaring</Panah>
      )}
      <Simpul icon={RouterIcon}>Router, WAN {jalur.wan}</Simpul>
      <ul className="mt-2 ml-4 border-l-2 border-[#DADDE8] pl-3 space-y-1.5">
        {jalur.layanan.map((l, i) => {
          const [warna, teks] = keadaan(l, nanti)
          return (
            <li key={i} className="text-[13px] flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${TITIK[warna]}`} />
              <span className="font-semibold text-[#0F172A]">{l.nama}</span>
              <span className="font-mono text-xs text-[#475569]">{l.port}</span>
              <span className="text-xs text-[#475569] basis-full pl-4 sm:basis-auto sm:pl-0">{teks}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
  return (
    <figure className="space-y-2">
      <figcaption className="font-semibold text-[#0F172A]">Gambarannya</figcaption>
      <div className="grid md:grid-cols-2 gap-3">
        {panel(false)}
        {panel(true)}
      </div>
    </figure>
  )
}

/** Batang CPU/RAM/disk dengan garis batas standar. */
function GambarMeter({ meter }: { meter: NonNullable<DoctorCek['meter']> }) {
  return (
    <figure className="rounded-2xl border border-[#EEF0F6] p-4 space-y-3.5">
      <figcaption className="font-semibold text-[#0F172A]">Gambarannya (garis hitam = batas standar)</figcaption>
      {meter.map((m) => {
        const lewat = m.arah === 'maks' ? m.nilai >= m.batas : m.nilai < m.batas
        return (
          <div key={m.label}>
            <div className="flex justify-between gap-3 text-[13px]">
              <span className="font-semibold text-[#0F172A]">{m.label}</span>
              <span className="tabular-nums text-[#475569]">
                <span className={`font-bold ${lewat ? 'text-[#B91C1C]' : 'text-[#15803D]'}`}>{m.nilai}%</span>
                {' '}({m.arah === 'maks' ? 'maksimal' : 'minimal'} {m.batas}%)
              </span>
            </div>
            <div className="relative h-2.5 rounded-full bg-[#F1F2F7] mt-1.5">
              <div className={`h-full rounded-full animate-tumbuh ${lewat ? 'bg-[#DC2626]' : 'bg-[#16A34A]'}`} style={{ width: `${Math.min(100, m.nilai)}%` }} />
              <div className="absolute -top-1 -bottom-1 w-0.5 rounded bg-[#0F172A]" style={{ left: `${m.batas}%` }} />
            </div>
          </div>
        )
      })}
    </figure>
  )
}

const KOTAK: Record<DoctorStatus, string> = {
  kritis: 'bg-[#FEF2F2] border-[#FECACA]',
  peringatan: 'bg-[#FFFBEB] border-[#FDE68A]',
  info: 'bg-[#F3F4FF] border-[#D9DCFB]',
  ok: 'bg-[#F0FDF4] border-[#BBF7D0]',
}

function Temuan({ c, buka }: { c: DoctorCek; buka: boolean }) {
  return (
    <li>
      <details open={buka} className="group py-4 text-sm">
        <summary className="flex items-start gap-3 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
          <span className={`pill ${STATUS_DOCTOR[c.status].pill} w-[78px] justify-center flex-shrink-0`}>{STATUS_DOCTOR[c.status].label}</span>
          <span className="min-w-0 flex-1">
            <span className="font-bold text-[#0F172A] break-words">{c.masalah ?? c.judul}</span>
            <span className="block text-xs text-[#475569] mt-0.5">{c.kategori}</span>
          </span>
          <ChevronDown className="w-4 h-4 mt-0.5 text-[#475569] flex-shrink-0 transition-transform group-open:rotate-180" />
        </summary>

        <div className="mt-3.5 sm:pl-[90px] space-y-3.5">
          {c.standar ? (
            <div className="grid sm:grid-cols-2 gap-2.5">
              <div className={`rounded-xl border px-3.5 py-3 ${KOTAK[c.status]}`}>
                <p className="text-xs font-bold uppercase tracking-[0.04em] text-[#334155]">Di router ini</p>
                <p className="mt-1 text-[#0F172A] break-words">{c.detail}</p>
              </div>
              <div className={`rounded-xl border px-3.5 py-3 ${KOTAK.ok}`}>
                <p className="text-xs font-bold uppercase tracking-[0.04em] text-[#334155]">Standar Perwira</p>
                <p className="mt-1 text-[#0F172A] break-words">{c.standar}</p>
              </div>
            </div>
          ) : (
            <p className="text-[#475569] break-words">{c.detail}</p>
          )}

          {c.dampak && (
            <p className="break-words">
              <span className="font-semibold text-[#0F172A]">Kalau dibiarkan: </span>
              <span className="text-[#475569]">{c.dampak}</span>
            </p>
          )}

          {c.jalur && <GambarJalur jalur={c.jalur} />}
          {c.meter && <GambarMeter meter={c.meter} />}

          {c.perbaikan && (
            <div>
              <p className="font-semibold text-[#0F172A]">Cara memperbaiki</p>
              <p className="text-xs text-[#475569] mt-0.5">
                Tempel di Terminal router (Winbox, menu New Terminal). Baris yang diawali # hanya catatan, tidak dijalankan.
              </p>
              <pre className="mt-2 px-4 py-3 rounded-[14px] bg-[#111827] text-[#E2E4EC] text-xs leading-relaxed font-mono overflow-x-auto whitespace-pre">
                {c.perbaikan}
              </pre>
            </div>
          )}
        </div>
      </details>
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
            Doctor membaca konfigurasi router lewat SSH lalu membandingkannya dengan standar Perwira.
            Doctor tidak mengubah apa pun: perintah perbaikan Anda salin dan jalankan sendiri di router.
            Hasilnya diperbarui setiap backup berhasil.
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
        <div className="space-y-3">
          <ArtiStatus />
          <p className="text-[13px] text-[#475569]">Buka temuan untuk melihat rinciannya. Yang paling berat di atas.</p>
          <ul className="divide-y divide-[#EEF0F6] border-y border-[#EEF0F6]">
            {masalah.map((c, i) => <Temuan key={c.id} c={c} buka={i === 0} />)}
          </ul>
        </div>
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
