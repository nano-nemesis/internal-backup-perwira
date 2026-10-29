import { useState } from 'react'
import { ChevronDown, Download, FileArchive, ShieldCheck } from 'lucide-react'
import type { BackupFile, CekStatus, HasilRestore, ItemCek } from '../../types'
import { cn, formatBytes, formatDatetimeWIB } from '../../lib/utils'
import { useAuth } from '../../context/AuthContext'
import { useVerifikasiBerkas } from '../../hooks/useNodes'
import { toast } from '../ui/toaster'

interface BackupFileListProps {
  files: BackupFile[]
  nodeId: string
}

const PIL: Record<CekStatus | 'berjalan' | 'belum', { teks: string; kelas: string }> = {
  ok: { teks: 'OK', kelas: 'bg-[#BBF7D0] text-[#14532D]' },
  peringatan: { teks: 'Perhatian', kelas: 'bg-[#FEF3C7] text-[#92400E]' },
  gagal: { teks: 'Gagal', kelas: 'bg-[#DC2626] text-white' },
  berjalan: { teks: 'Berjalan…', kelas: 'bg-[#E0E3FF] text-[#2E3AC2]' },
  belum: { teks: 'Belum', kelas: 'bg-[#EEF0F6] text-[#475569]' },
}

/** Dump database bisa di-restore uji; berkas MikroTik cukup cek struktur (tanpa router). */
const bisaRestore = (f: string) => /\.(sql\.gz|tar)$/.test(f)

function Pil({ label, status }: { label: string; status: keyof typeof PIL }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-[#475569]">
      {label}
      <span className={cn('pill', PIL[status].kelas)}>{PIL[status].teks}</span>
    </span>
  )
}

function DaftarCek({ cek }: { cek: ItemCek[] }) {
  return (
    <ul className="divide-y divide-[#EEF0F6]">
      {cek.map((c, i) => (
        <li key={i} className="py-2.5 flex gap-3 text-[13px]">
          <span className="w-[86px] flex-shrink-0"><span className={cn('pill', PIL[c.status].kelas)}>{PIL[c.status].teks}</span></span>
          <div className="min-w-0">
            <p className="font-bold text-[#0F172A]">{c.judul}</p>
            <p className="text-[#475569] break-words">{c.detail}</p>
          </div>
        </li>
      ))}
    </ul>
  )
}

function Restore({ r }: { r: HasilRestore }) {
  if (r.status === 'berjalan') {
    return <p className="text-[13px] text-[#475569]">Restore uji sedang berjalan di antrean (dimulai {formatDatetimeWIB(r.pada)}). Halaman ini memperbarui dirinya sendiri.</p>
  }
  return (
    <div className="space-y-2">
      <p className="text-[13px] text-[#334155]">
        {r.ringkasan}. {formatDatetimeWIB(r.pada)}{r.oleh && ` oleh ${r.oleh}`}{r.detik != null && `, ${r.detik} detik`}.
      </p>
      {r.galat && <p className="text-[13px] text-[#991B1B] break-words">{r.galat}</p>}
      <DaftarCek cek={(r.database ?? []).map((d) => ({ status: d.status, judul: d.db, detail: d.detail }))} />
    </div>
  )
}

export function BackupFileList({ files, nodeId }: BackupFileListProps) {
  // Isi berkasnya memuat kredensial pelanggan dalam teks polos, jadi unduhan
  // dibatasi operator ke atas, sama seperti penjagaan di sisi API. Viewer tetap
  // melihat daftar dan ukurannya; yang disembunyikan hanya tombolnya.
  const { isOperator } = useAuth()
  const verifikasi = useVerifikasiBerkas()
  const [buka, setBuka] = useState<string | null>(null)

  if (files.length === 0) {
    return (
      <div className="text-center py-10 text-[#475569] text-sm">
        Belum ada berkas backup
      </div>
    )
  }

  const jalankan = async (filename: string) => {
    try {
      const r = await verifikasi.mutateAsync({ nodeId, filename })
      toast(r.data?.message ?? 'Verifikasi dijalankan', 'info')
      setBuka(filename)
    } catch (err: any) {
      toast(err.response?.data?.message ?? 'Gagal memverifikasi berkas', 'error')
    }
  }

  return (
    <div className="divide-y divide-[#EEF0F6]">
      {files.map((file) => {
        const v = file.verifikasi
        const restore = bisaRestore(file.filename)
        const terbuka = buka === file.filename
        const sedang = verifikasi.isPending && verifikasi.variables?.filename === file.filename
        return (
          <div key={file.filename} className="px-5 md:px-6 py-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <span className="w-10 h-10 rounded-xl bg-[#F1F2F7] text-[#334155] flex items-center justify-center flex-shrink-0"><FileArchive className="w-[18px] h-[18px]" strokeWidth={1.8} /></span>
              <div className="min-w-0 flex-1 basis-[calc(100%-52px)] sm:basis-0">
                <p className="text-[13px] font-mono font-medium text-[#0F172A] truncate">
                  {file.filename}
                </p>
                <p className="text-xs text-[#475569] mt-0.5">
                  {file.modified_at} · {formatBytes(file.size)}
                </p>
                <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5">
                  <Pil label="Struktur" status={v?.struktur?.status ?? 'belum'} />
                  {restore && <Pil label="Restore uji" status={v?.restore?.status ?? 'belum'} />}
                </div>
              </div>
              <div className="flex items-center gap-2 ml-auto">
                {v && (
                  <button
                    onClick={() => setBuka(terbuka ? null : file.filename)}
                    aria-expanded={terbuka}
                    className="flex items-center gap-1 px-3 text-[13px] font-semibold rounded-xl text-[#334155] hover:bg-[#F1F2F7] min-h-[44px]"
                  >
                    Detail
                    <ChevronDown className={cn('w-4 h-4 transition-transform', terbuka && 'rotate-180')} />
                  </button>
                )}
                {isOperator && (
                  <button
                    onClick={() => jalankan(file.filename)}
                    disabled={sedang || v?.restore?.status === 'berjalan'}
                    aria-label={`Verifikasi ${file.filename}`}
                    title={restore ? 'Cek struktur, lalu restore uji ke database sementara' : 'Cek struktur berkas'}
                    className="flex items-center justify-center gap-1.5 px-3.5 text-[13px] font-semibold rounded-xl border border-[#DADDE8] bg-white hover:bg-[#F4F5FA] text-[#334155] min-h-[44px] min-w-[44px] disabled:opacity-50"
                  >
                    <ShieldCheck className="w-4 h-4" />
                    <span className="hidden sm:inline">{sedang ? 'Memeriksa…' : 'Verifikasi'}</span>
                  </button>
                )}
                {isOperator && (
                  <a
                    href={`/api/nodes/${nodeId}/download/${file.filename}`}
                    download
                    onClick={(e) => e.stopPropagation()}
                    aria-label={`Unduh ${file.filename}`}
                    className="flex items-center justify-center gap-1.5 px-3.5 text-[13px] font-semibold rounded-xl bg-[#EEF0FE] hover:bg-[#E0E3FF] text-[#2E3AC2] transition-colors min-h-[44px] min-w-[44px]"
                  >
                    <Download className="w-4 h-4" />
                    <span className="hidden sm:inline">Unduh</span>
                  </a>
                )}
              </div>
            </div>

            {terbuka && v && (
              <div className="mt-3 rounded-2xl bg-[#F8F9FC] p-4 space-y-4">
                {v.struktur && (
                  <div>
                    <h4 className="text-sm font-bold text-[#0F172A]">Cek struktur · {formatDatetimeWIB(v.struktur.pada)}</h4>
                    <DaftarCek cek={v.struktur.cek} />
                  </div>
                )}
                {restore && (
                  <div>
                    <h4 className="text-sm font-bold text-[#0F172A] mb-1">Restore uji</h4>
                    {v.restore ? <Restore r={v.restore} /> : (
                      <p className="text-[13px] text-[#475569]">
                        Belum pernah. Tekan Verifikasi untuk mengimpor dump ini ke database sementara dan membandingkan isinya.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
