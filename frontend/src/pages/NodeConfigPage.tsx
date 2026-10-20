import { useRef, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Download, Upload, ShieldAlert, FileJson } from 'lucide-react'
import { Button } from '../components/ui/button'
import { toast } from '../components/ui/toaster'
import { useAuth } from '../context/AuthContext'
import {
  downloadJson,
  NODE_TEMPLATE,
  useExportNodes,
  useImportNodes,
  type ImportError,
  type ImportResult,
} from '../hooks/useNodeConfig'

function apiMessage(err: unknown, fallback: string): string {
  const res = (err as { response?: { data?: { message?: string } } }).response?.data
  return res?.message ?? fallback
}

function apiImportErrors(err: unknown): ImportError[] {
  const res = (err as { response?: { data?: { errors?: unknown } } }).response?.data
  return Array.isArray(res?.errors) ? (res!.errors as ImportError[]) : []
}

export default function NodeConfigPage() {
  const { isAdmin } = useAuth()
  const exportNodes = useExportNodes()
  const importNodes = useImportNodes()

  const fileRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState('')
  const [nodes, setNodes] = useState<unknown[] | null>(null)
  const [mode, setMode] = useState<'skip' | 'update'>('skip')
  const [preview, setPreview] = useState<ImportResult | null>(null)
  const [rowErrors, setRowErrors] = useState<ImportError[]>([])

  if (!isAdmin) return <Navigate to="/dashboard" replace />

  const resetImport = () => {
    setFileName(''); setNodes(null); setPreview(null); setRowErrors([])
    if (fileRef.current) fileRef.current.value = ''
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
      toast(`${list.length} node terbaca dari ${file.name}`, 'info')
    } catch (e) {
      setFileName('')
      toast(
        e instanceof SyntaxError
          ? 'Berkas bukan JSON yang valid.'
          : (e as Error).message || 'Gagal membaca berkas.',
        'error',
      )
    }
  }

  const run = async (dryRun: boolean) => {
    if (!nodes) return
    setRowErrors([])
    try {
      const res = await importNodes.mutateAsync({ nodes, mode, dry_run: dryRun })
      if (dryRun) {
        setPreview(res)
      } else {
        toast(
          `Impor selesai — ${res.summary.create} dibuat, ${res.summary.update} diperbarui, ${res.summary.skip} dilewati`,
          'success',
        )
        resetImport()
      }
    } catch (err) {
      setPreview(null)
      setRowErrors(apiImportErrors(err))
      toast(apiMessage(err, 'Impor gagal'), 'error')
    }
  }

  return (
    <div className="space-y-5 max-w-screen-lg">
      <div>
        <h1 className="text-[28px] leading-tight font-extrabold text-[#0F172A]">Konfigurasi Node</h1>
        <p className="text-sm text-[#475569] mt-1">
          Cadangkan daftar node ke berkas JSON, atau tambahkan node secara massal dari berkas.
        </p>
      </div>

      {/* ── Ekspor ───────────────────────────────────────────────────────── */}
      <div className="card p-5 md:p-6 space-y-4">
        <div className="flex items-center gap-3">
          <span className="w-9 h-9 rounded-xl bg-[#EEF0FE] text-[#2E3AC2] flex items-center justify-center"><Download className="w-[18px] h-[18px]" strokeWidth={1.8} /></span>
          <h2 className="text-lg font-bold text-[#0F172A]">Ekspor</h2>
        </div>

        <p className="text-sm text-[#475569]">
          Berkas berisi konfigurasi target: nama, tipe, host, port, user SSH, path key,
          nama/user database, dan interval jadwal. Riwayat backup dan berkas hasil backup
          <strong> tidak </strong> ikut — ini konfigurasi, bukan cadangan basis data.
        </p>

        <div className="flex flex-wrap gap-3">
          <Button
            onClick={() =>
              exportNodes.mutate(false, {
                onError: (e) => toast(apiMessage(e, 'Ekspor gagal'), 'error'),
              })
            }
            loading={exportNodes.isPending}
          >
            <Download className="w-4 h-4" />
            Unduh tanpa password
          </Button>
          <Button
            variant="secondary"
            onClick={() =>
              exportNodes.mutate(true, {
                onError: (e) => toast(apiMessage(e, 'Ekspor gagal'), 'error'),
              })
            }
            loading={exportNodes.isPending}
          >
            <ShieldAlert className="w-4 h-4" />
            Unduh lengkap (dengan password)
          </Button>
        </div>

        <div className="rounded-xl bg-[#FEF3C7] px-4 py-3 text-sm text-[#78350F]">
          <p>
            <strong>Tanpa password</strong> — aman disimpan dan dibagikan. Cocok jadi templat
            untuk menambah node massal. Setelah diimpor, password tiap node harus diisi ulang.
          </p>
          <p className="mt-2">
            <strong>Lengkap</strong> — password ikut dalam bentuk <em>terenkripsi</em>, bukan teks
            polos. Hanya bisa dipulihkan di instalasi dengan <code>APP_KEY</code> yang sama, jadi
            saat pindah VPS salin juga <code>APP_KEY</code> dari <code>.env</code>. Perlakukan
            berkas ini seperti kredensial.
          </p>
        </div>
      </div>

      {/* ── Impor ────────────────────────────────────────────────────────── */}
      <div className="card p-5 md:p-6 space-y-4">
        <div className="flex items-center gap-3">
          <span className="w-9 h-9 rounded-xl bg-[#EEF0FE] text-[#2E3AC2] flex items-center justify-center"><Upload className="w-[18px] h-[18px]" strokeWidth={1.8} /></span>
          <h2 className="text-lg font-bold text-[#0F172A]">Impor</h2>
        </div>

        <div className="rounded-xl bg-[#F4F5FA] px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-[#475569]">
            Belum punya berkasnya? Unduh templat berisi satu contoh per tipe node, lalu
            sunting dengan editor teks. Password boleh diisi teks polos — hapus berkasnya
            setelah impor.
          </p>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => downloadJson(NODE_TEMPLATE, 'templat-node.json')}
          >
            <FileJson className="w-4 h-4" />
            Unduh templat JSON
          </Button>
        </div>

        <div>
          <label
            htmlFor="node-config-file"
            className="block text-sm text-[#475569] mb-2"
          >
            Berkas JSON hasil ekspor (atau daftar node yang Anda tulis sendiri)
          </label>
          <input
            id="node-config-file"
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) handleFile(f)
            }}
            className="block w-full text-sm text-[#0F172A] file:mr-3 file:py-2 file:px-4
                       file:rounded-lg file:border file:border-[#DADDE8] file:font-semibold file:text-sm
                       file:bg-white hover:file:bg-[#F4F5FA] file:cursor-pointer
                       border border-[#DADDE8] rounded-xl min-h-[44px] py-1.5 px-2"
          />
          {fileName && (
            <p className="text-xs text-[#475569] mt-2 flex items-center gap-1.5">
              <FileJson className="w-3.5 h-3.5" />
              {fileName} · {nodes?.length ?? 0} node
            </p>
          )}
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm text-[#475569] mb-1">Kalau nama node sudah ada:</legend>
          {([
            ['skip', 'Lewati: node yang sudah ada tidak disentuh sama sekali'],
            ['update', 'Perbarui: konfigurasinya ditimpa isi berkas'],
          ] as const).map(([val, label]) => (
            <label key={val} className="flex items-start gap-2 text-sm cursor-pointer">
              <input
                type="radio"
                name="import-mode"
                value={val}
                checked={mode === val}
                onChange={() => { setMode(val); setPreview(null) }}
                className="mt-0.5 w-4 h-4 accent-[#4255F0]"
              />
              <span className="text-[#0F172A]">{label}</span>
            </label>
          ))}
        </fieldset>

        <div className="flex flex-wrap gap-3">
          <Button
            variant="secondary"
            disabled={!nodes}
            loading={importNodes.isPending && !preview}
            onClick={() => run(true)}
          >
            Pratinjau
          </Button>
          <Button
            disabled={!preview}
            loading={importNodes.isPending && !!preview}
            onClick={() => run(false)}
          >
            Terapkan impor
          </Button>
        </div>

        {preview && (
          <div className="rounded-xl bg-[#F4F5FA] px-4 py-3 text-sm space-y-1">
            <p className="text-[#0F172A] font-medium">
              Pratinjau, belum ada yang berubah
            </p>
            <p className="text-[#475569]">
              {preview.summary.create} akan dibuat · {preview.summary.update} akan diperbarui ·{' '}
              {preview.summary.skip} dilewati
            </p>
            {preview.detail && (
              <div className="text-xs text-[#475569] pt-1 space-y-0.5">
                {(['create', 'update', 'skip'] as const).map((k) =>
                  preview.detail![k].length ? (
                    <p key={k}>
                      <span className="font-mono">{k}</span>: {preview.detail![k].join(', ')}
                    </p>
                  ) : null,
                )}
              </div>
            )}
          </div>
        )}

        {rowErrors.length > 0 && (
          <div className="rounded-xl bg-[#FEE2E2] px-4 py-3 text-sm text-[#991B1B] space-y-1">
            <p className="font-medium">
              Tidak ada perubahan yang diterapkan. Perbaiki dulu entri berikut:
            </p>
            <ul className="list-disc pl-5 space-y-0.5">
              {rowErrors.slice(0, 20).map((e) => (
                <li key={e.index}>
                  <span className="font-mono">#{e.index}</span>
                  {e.name ? ` (${e.name})` : ''}: {e.errors.join('; ')}
                </li>
              ))}
            </ul>
            {rowErrors.length > 20 && (
              <p className="text-xs">…dan {rowErrors.length - 20} entri lain.</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
