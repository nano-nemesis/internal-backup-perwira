import { useRef, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Download, FileJson, Upload, AlertTriangle } from 'lucide-react'
import { Button } from '../components/ui/button'
import { toast } from '../components/ui/toaster'
import { useAuth } from '../context/AuthContext'
import { useDeleteAllNodes, useNodes } from '../hooks/useNodes'
import { cn } from '../lib/utils'
import {
  downloadJson,
  NODE_TEMPLATE,
  useExportNodes,
  useImportNodes,
  type ImportError,
  type ImportResult,
} from '../hooks/useNodeConfig'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../components/ui/alert-dialog'

function apiMessage(err: unknown, fallback: string): string {
  const res = (err as { response?: { data?: { message?: string } } }).response?.data
  return res?.message ?? fallback
}

function apiImportErrors(err: unknown): ImportError[] {
  const res = (err as { response?: { data?: { errors?: unknown } } }).response?.data
  return Array.isArray(res?.errors) ? (res!.errors as ImportError[]) : []
}

type Mode = 'skip' | 'update'
type Entri = { name?: unknown; type?: unknown; host?: unknown }

const TIPE: Record<string, string> = { mikrotik: 'MikroTik', database: 'Database', virtualizor_db: 'Virtualizor' }

export default function NodeConfigPage() {
  const { isAdmin } = useAuth()
  const { data: nodesData } = useNodes()
  const exportNodes = useExportNodes()
  const importNodes = useImportNodes()
  const deleteAll = useDeleteAllNodes()

  const fileRef = useRef<HTMLInputElement>(null)
  const [lengkap, setLengkap] = useState(false)
  const [fileName, setFileName] = useState('')
  const [nodes, setNodes] = useState<Entri[] | null>(null)
  const [mode, setMode] = useState<Mode>('skip')
  const [preview, setPreview] = useState<ImportResult | null>(null)
  const [rowErrors, setRowErrors] = useState<ImportError[]>([])
  const [seret, setSeret] = useState(false)
  const [hapusBuka, setHapusBuka] = useState(false)
  const [konfirmasi, setKonfirmasi] = useState('')

  if (!isAdmin) return <Navigate to="/dashboard" replace />

  const jumlahNode = nodesData?.data.length

  const resetImport = () => {
    setFileName(''); setNodes(null); setPreview(null); setRowErrors([])
    if (fileRef.current) fileRef.current.value = ''
  }

  // Pratinjau (dry run) langsung jalan setelah berkas dibaca atau mode diganti:
  // yang dilihat selalu hasil sebenarnya dari server, bukan tebakan halaman.
  const pratinjau = async (list: Entri[], m: Mode) => {
    setRowErrors([])
    try {
      setPreview(await importNodes.mutateAsync({ nodes: list, mode: m, dry_run: true }))
    } catch (err) {
      setPreview(null)
      setRowErrors(apiImportErrors(err))
      if (!apiImportErrors(err).length) toast(apiMessage(err, 'Pratinjau gagal'), 'error')
    }
  }

  const handleFile = async (file: File) => {
    resetImport()
    setFileName(file.name)
    try {
      const parsed = JSON.parse(await file.text())
      const list = Array.isArray(parsed) ? parsed : parsed?.nodes
      if (!Array.isArray(list) || list.length === 0) {
        throw new Error('Tidak menemukan daftar "nodes" di dalam berkas.')
      }
      setNodes(list)
      await pratinjau(list, mode)
    } catch (e) {
      setFileName('')
      toast(
        e instanceof SyntaxError ? 'Berkas bukan JSON yang valid.' : (e as Error).message || 'Gagal membaca berkas.',
        'error',
      )
    }
  }

  const ubahMode = (m: Mode) => {
    setMode(m)
    if (nodes) pratinjau(nodes, m)
  }

  const terapkan = async () => {
    if (!nodes) return
    try {
      const res = await importNodes.mutateAsync({ nodes, mode, dry_run: false })
      toast(`Impor selesai: ${res.summary.create} dibuat, ${res.summary.update} diperbarui, ${res.summary.skip} dilewati`, 'success')
      resetImport()
    } catch (err) {
      setPreview(null)
      setRowErrors(apiImportErrors(err))
      toast(apiMessage(err, 'Impor gagal'), 'error')
    }
  }

  const hapusSemua = async () => {
    try {
      await deleteAll.mutateAsync()
      toast('Semua node berhasil dihapus', 'success')
      setHapusBuka(false)
      setKonfirmasi('')
    } catch (err) {
      toast(apiMessage(err, 'Gagal menghapus semua node'), 'error')
    }
  }

  const hasil = (e: Entri, i: number): [string, string] => {
    const salah = rowErrors.find((r) => r.index === i)
    if (salah) return [salah.errors.join('; '), 'text-[#B91C1C]']
    const nama = typeof e.name === 'string' ? e.name : ''
    if (preview?.detail?.create.includes(nama)) return ['baru', 'text-[#15803D]']
    if (preview?.detail?.update.includes(nama)) return ['diperbarui', 'text-[#2E3AC2]']
    if (preview?.detail?.skip.includes(nama)) return ['dilewati, sudah ada', 'text-[#475569]']
    return ['valid', 'text-[#475569]']
  }
  const perubahan = preview ? preview.summary.create + preview.summary.update : 0

  return (
    <div className="space-y-5 max-w-screen-2xl">
      <header>
        <h1 className="text-[28px] leading-tight font-extrabold text-[#0F172A]">Konfigurasi Node</h1>
        <p className="text-sm text-[#475569] mt-1">
          Cadangkan daftar node sebagai JSON, atau tambahkan banyak node sekaligus
        </p>
      </header>

      <div className="flex flex-wrap gap-5 items-start">
        {/* ── Ekspor ── */}
        <section className="card flex-[1_1_340px] min-w-0 p-5 md:p-6 flex flex-col gap-4">
          <div>
            <h2 className="text-lg font-bold">Ekspor</h2>
            <p className="text-[13px] text-[#475569] mt-1">
              {jumlahNode === undefined ? 'Menghitung node…' : `${jumlahNode} node siap diekspor`}
            </p>
          </div>
          <fieldset className="flex flex-col gap-2.5">
            <legend className="sr-only">Mode ekspor</legend>
            {([
              [false, 'Tanpa password', 'Aman disimpan atau dibagikan. Cocok jadi templat menambah node. Setelah diimpor, password tiap node harus diisi ulang.'],
              [true, 'Lengkap', 'Password ikut, terenkripsi. Hanya bisa dipulihkan di instalasi dengan APP_KEY yang sama; saat pindah VPS salin juga APP_KEY dari .env. Perlakukan berkasnya seperti kredensial.'],
            ] as const).map(([nilai, judul, ket]) => (
              <label
                key={judul}
                className={cn(
                  'flex gap-3 items-start rounded-[14px] p-3.5 cursor-pointer transition-colors',
                  lengkap === nilai ? 'border-2 border-[#4255F0] bg-[#F5F6FF]' : 'border border-[#DADDE8] hover:bg-[#F8F9FC] m-px',
                )}
              >
                <input
                  type="radio"
                  name="mode-ekspor"
                  checked={lengkap === nilai}
                  onChange={() => setLengkap(nilai)}
                  className="mt-1 w-4 h-4 accent-[#4255F0]"
                />
                <span>
                  <span className="block font-bold text-sm">{judul}</span>
                  <span className="block text-[13px] text-[#475569] mt-0.5 leading-relaxed">{ket}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <Button
            size="lg"
            className="justify-center"
            loading={exportNodes.isPending}
            onClick={() => exportNodes.mutate(lengkap, { onError: (e) => toast(apiMessage(e, 'Ekspor gagal'), 'error') })}
          >
            <Download className="w-4 h-4" />
            Unduh JSON
          </Button>
          <p className="text-xs text-[#475569]">
            Riwayat backup dan berkas hasil backup tidak ikut. Ini konfigurasi, bukan cadangan basis data.
          </p>
        </section>

        {/* ── Impor ── */}
        <section className="card flex-[2_1_480px] min-w-0 p-5 md:p-6 flex flex-col gap-4">
          <div className="flex justify-between items-start gap-3 flex-wrap">
            <div>
              <h2 className="text-lg font-bold">Impor</h2>
              <p className="text-[13px] text-[#475569] mt-1">
                Pratinjau dulu. Kalau ada satu entri tidak valid, tidak ada yang disimpan.
              </p>
            </div>
            <button
              type="button"
              onClick={() => downloadJson(NODE_TEMPLATE, 'templat-node.json')}
              className="inline-flex items-center gap-1.5 min-h-[40px] px-2 -mx-2 rounded-lg text-sm font-semibold text-[#3442D9] hover:bg-[#EEF0FE] transition-colors"
            >
              <FileJson className="w-4 h-4" />
              Unduh templat JSON
            </button>
          </div>

          <input
            id="node-config-file"
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) handleFile(f)
            }}
          />
          <label
            htmlFor="node-config-file"
            onDragOver={(e) => { e.preventDefault(); setSeret(true) }}
            onDragLeave={() => setSeret(false)}
            onDrop={(e) => {
              e.preventDefault()
              setSeret(false)
              const f = e.dataTransfer.files?.[0]
              if (f) handleFile(f)
            }}
            className={cn(
              'flex items-center gap-4 border-2 border-dashed rounded-2xl p-4 md:p-5 flex-wrap cursor-pointer transition-colors',
              seret ? 'border-[#4255F0] bg-[#F5F6FF]' : 'border-[#C9CCD8] hover:border-[#8C99F7] hover:bg-[#F8F9FC]',
            )}
          >
            <span className="w-12 h-12 rounded-[14px] bg-[#EEF0FE] text-[#2E3AC2] flex items-center justify-center flex-shrink-0">
              {fileName ? <FileJson className="w-6 h-6" strokeWidth={1.8} /> : <Upload className="w-6 h-6" strokeWidth={1.8} />}
            </span>
            <span className="flex-[1_1_200px] min-w-0">
              {fileName ? (
                <>
                  <span className="block font-bold text-sm font-mono break-all">{fileName}</span>
                  <span className="block text-[13px] text-[#475569] mt-0.5">
                    {nodes?.length ?? 0} entri{importNodes.isPending ? ' · memeriksa…' : ''}
                  </span>
                </>
              ) : (
                <>
                  <span className="block font-bold text-sm">Pilih berkas JSON</span>
                  <span className="block text-[13px] text-[#475569] mt-0.5">atau seret ke sini · hasil ekspor, atau daftar node yang Anda tulis sendiri</span>
                </>
              )}
            </span>
            <span className="min-h-[40px] px-3.5 rounded-[10px] border border-[#DADDE8] bg-white text-[13px] font-semibold inline-flex items-center">
              {fileName ? 'Ganti berkas' : 'Pilih berkas'}
            </span>
          </label>

          <div className="flex items-center gap-3 flex-wrap text-[13px]">
            <span className="font-semibold text-[#334155]">Kalau nama node sudah ada:</span>
            <div className="flex gap-2">
              {([['skip', 'Lewati'], ['update', 'Perbarui']] as const).map(([m, label]) => (
                <button key={m} type="button" aria-pressed={mode === m} onClick={() => ubahMode(m)} className="chip">
                  {label}
                </button>
              ))}
            </div>
            <span className="text-[#475569]">
              {mode === 'skip' ? 'node yang sudah ada tidak disentuh' : 'konfigurasinya ditimpa isi berkas'}
            </span>
          </div>

          {nodes && (preview || rowErrors.length > 0) && (
            <div className="space-y-4 animate-pudar">
              <div className="flex gap-2 flex-wrap">
                {preview && <span className="pill bg-[#BBF7D0] text-[#14532D]">{preview.summary.create} baru</span>}
                {preview && <span className="pill bg-[#E0E3FF] text-[#2E3AC2]">{preview.summary.update} diperbarui</span>}
                {preview && preview.summary.skip > 0 && <span className="pill bg-[#F1F2F7] text-[#334155]">{preview.summary.skip} dilewati</span>}
                <span className={cn('pill', rowErrors.length ? 'bg-[#FEE2E2] text-[#991B1B]' : 'bg-[#F1F2F7] text-[#334155]')}>
                  {rowErrors.length} tidak valid
                </span>
              </div>
              <div className="overflow-x-auto border border-[#EEF0F6] rounded-[14px]">
                <table className="w-full min-w-[520px] text-[13px]">
                  <thead className="bg-[#FAFBFD]">
                    <tr>
                      <th className="th !py-2.5">#</th>
                      <th className="th !py-2.5">Nama</th>
                      <th className="th !py-2.5">Tipe</th>
                      <th className="th !py-2.5">Host</th>
                      <th className="th !py-2.5">Hasil</th>
                    </tr>
                  </thead>
                  <tbody>
                    {nodes.map((e, i) => {
                      const [teks, gaya] = hasil(e, i)
                      return (
                        <tr key={i} className="border-t border-[#EEF0F6]">
                          <td className="px-3 py-2.5 text-[#475569]">{i}</td>
                          <td className="px-3 py-2.5 font-semibold">{typeof e.name === 'string' ? e.name : '—'}</td>
                          <td className="px-3 py-2.5">{TIPE[String(e.type)] ?? String(e.type ?? '—')}</td>
                          <td className="px-3 py-2.5 font-mono">{typeof e.host === 'string' ? e.host : '—'}</td>
                          <td className={cn('px-3 py-2.5 font-semibold break-words', gaya)}>{teks}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-end gap-2.5 flex-wrap">
                <Button variant="secondary" onClick={resetImport}>Batal</Button>
                <Button
                  disabled={!preview || rowErrors.length > 0 || perubahan === 0}
                  loading={importNodes.isPending}
                  onClick={terapkan}
                >
                  {perubahan ? `Terapkan ${perubahan} perubahan` : 'Tidak ada perubahan'}
                </Button>
              </div>
            </div>
          )}
        </section>
      </div>

      {/* ── Zona berbahaya ── */}
      <section className="bg-white border border-[#FECACA] rounded-[20px] p-5 md:p-6 flex items-center gap-4 flex-wrap">
        <span className="w-12 h-12 rounded-[14px] bg-[#FEF2F2] text-[#B91C1C] flex items-center justify-center flex-shrink-0">
          <AlertTriangle className="w-6 h-6" strokeWidth={1.8} />
        </span>
        <div className="flex-[1_1_320px]">
          <h2 className="text-base font-bold text-[#991B1B]">Zona berbahaya: hapus semua node</h2>
          <p className="text-[13px] text-[#475569] mt-1 leading-relaxed">
            Menghapus {jumlahNode ?? 'semua'} node beserta jadwal, log backup, dan kredensial SSH/DB-nya. Berkas backup di
            disk tidak ikut terhapus. Ekspor dulu sebelum melakukan ini.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setHapusBuka(true)}
          disabled={!jumlahNode}
          className="min-h-[44px] px-4 rounded-[14px] border border-[#DC2626] bg-white text-[#B91C1C] text-sm font-bold hover:bg-[#FEF2F2] transition-colors disabled:opacity-40"
        >
          Hapus semua node
        </button>
      </section>

      <AlertDialog
        open={hapusBuka}
        onOpenChange={(open) => {
          setHapusBuka(open)
          if (!open) setKonfirmasi('')
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus semua node?</AlertDialogTitle>
            <AlertDialogDescription>
              Semua {jumlahNode} node beserta log backup dan kredensialnya terhapus permanen. Tindakan ini tidak dapat dibatalkan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="px-1 pb-1">
            <label htmlFor="delete-all-confirm" className="block text-sm text-[#475569] mb-2">
              Ketik <span className="font-mono font-semibold text-[#991B1B]">HAPUS SEMUA</span> untuk mengaktifkan tombol.
            </label>
            <input
              id="delete-all-confirm"
              autoComplete="off"
              value={konfirmasi}
              onChange={(e) => setKonfirmasi(e.target.value)}
              className="w-full px-3.5 py-2 border border-[#DADDE8] rounded-xl font-mono text-sm min-h-[44px] focus:outline-none focus:border-[#4255F0] focus:ring-4 focus:ring-[#4255F0]/15"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setHapusBuka(false)}>Batal</AlertDialogCancel>
            <AlertDialogAction
              className="bg-[#DC2626] hover:bg-[#B91C1C] text-white"
              onClick={hapusSemua}
              disabled={deleteAll.isPending || konfirmasi !== 'HAPUS SEMUA'}
            >
              {deleteAll.isPending ? 'Menghapus...' : 'Hapus semua node'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
