import { useState } from 'react'
import { Download, HardDrive, ChevronLeft, ChevronRight, FileArchive } from 'lucide-react'
import { useBackupFiles } from '../hooks/useBackupFiles'
import { useNodes } from '../hooks/useNodes'
import { Badge } from '../components/ui/badge'
import { formatDatetimeWIB } from '../lib/utils'
import type { BackupFileItem } from '../types'
import { useAuth } from '../context/AuthContext'

const PER_PAGE = 20

function FileCard({ file }: { file: BackupFileItem }) {
  const { isOperator } = useAuth()

  return (
    <div className="card p-4 flex items-start gap-3">
      <span className="w-10 h-10 rounded-xl bg-[#F1F2F7] text-[#334155] flex items-center justify-center flex-shrink-0">
        <FileArchive className="w-[18px] h-[18px]" strokeWidth={1.8} />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-mono font-medium text-[#0F172A] break-all">{file.filename}</p>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <Badge variant={file.type as 'mikrotik' | 'database' | 'virtualizor_db'}>{file.type === 'virtualizor_db' ? 'Virtualizor' : file.type}</Badge>
          <span className="text-xs font-semibold text-[#334155]">{file.node_name}</span>
          <span className="text-xs text-[#475569]">{file.size_human}</span>
        </div>
        <p className="text-xs text-[#475569] mt-1">{formatDatetimeWIB(file.created_at)}</p>
      </div>
      {isOperator && (
        <a
          href={file.download_url}
          download={file.filename}
          className="rounded-xl bg-[#EEF0FE] hover:bg-[#E0E3FF] text-[#2E3AC2] transition-colors flex-shrink-0 w-11 h-11 flex items-center justify-center"
          title="Unduh"
          aria-label={`Unduh ${file.filename}`}
        >
          <Download className="w-4 h-4" />
        </a>
      )}
    </div>
  )
}

export default function BackupFilesPage() {
  // Sejalan dengan API: unduhan hanya untuk operator ke atas.
  const { isOperator } = useAuth()
  const [nodeId, setNodeId] = useState('')
  const [type, setType] = useState<'mikrotik' | 'database' | 'virtualizor_db' | ''>('')
  const [page, setPage] = useState(1)

  const { data: filesData, isLoading } = useBackupFiles({
    node_id: nodeId || undefined,
    type: type || undefined,
    page,
    per_page: PER_PAGE,
  })

  const { data: nodesData } = useNodes()

  const files = filesData?.data ?? []
  const meta = filesData?.meta
  const nodes = nodesData?.data ?? []

  const handleFilterChange = (setter: (v: any) => void, value: any) => {
    setter(value)
    setPage(1)
  }

  return (
    <div className="space-y-5 max-w-screen-2xl">
      <div>
        <h1 className="text-[28px] leading-tight font-extrabold text-[#0F172A]">Berkas Backup</h1>
        <p className="text-sm text-[#475569] mt-1">Unduh berkas backup per node</p>
      </div>

      {/* Filters */}
      <div className="card p-3 md:p-4 flex flex-wrap items-center gap-3">
        <select
          value={nodeId}
          onChange={(e) => handleFilterChange(setNodeId, e.target.value)}
          aria-label="Saring per node"
          className="flex-1 min-w-[180px] px-3.5 min-h-[44px] bg-white border border-[#DADDE8] rounded-xl text-sm text-[#0F172A] focus:outline-none focus:border-[#4255F0] focus:ring-4 focus:ring-[#4255F0]/15"
        >
          <option value="">Semua node</option>
          {nodes.map((n) => (
            <option key={n.id} value={n.id}>
              {n.name}
            </option>
          ))}
        </select>
        <div className="flex gap-1.5 flex-wrap">
          {(['', 'mikrotik', 'database', 'virtualizor_db'] as const).map((t) => (
            <button
              key={t}
              onClick={() => handleFilterChange(setType, t)}
              aria-pressed={type === t}
              className={`px-4 min-h-[40px] rounded-full text-[13px] font-semibold transition-colors ${
                type === t
                  ? 'bg-[#4255F0] text-white'
                  : 'bg-white border border-[#E2E4EC] text-[#334155] hover:bg-[#F1F2F7]'
              }`}
            >
              {t === '' ? 'Semua' : t === 'mikrotik' ? 'MikroTik' : t === 'database' ? 'Database' : 'Virtualizor'}
            </button>
          ))}
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="card p-8 text-center text-[#475569] text-sm animate-pulse">
          Memuat...
        </div>
      )}

      {/* Empty */}
      {!isLoading && files.length === 0 && (
        <div className="card p-16 text-center">
          <HardDrive className="w-12 h-12 text-[#CBD5E1] mx-auto mb-4" />
          <p className="text-[#475569] font-medium">Belum ada file backup tersedia.</p>
          <p className="text-[#94A3B8] text-sm mt-1">
            File akan muncul di sini setelah backup pertama berjalan.
          </p>
        </div>
      )}

      {/* Mobile: card list */}
      {!isLoading && files.length > 0 && (
        <>
          {/* Mobile cards */}
          <div className="space-y-3 md:hidden">
            {files.map((file) => (
              <FileCard key={`${file.node_name}-${file.filename}`} file={file} />
            ))}
          </div>

          {/* Desktop table */}
          <div className="card hidden md:block overflow-hidden pt-2">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#F8F9FC] border-y border-[#EEF0F6]">
                    {['Node', 'Nama berkas', 'Ukuran', 'Tanggal', ...(isOperator ? [''] : [])].map((h) => (
                      <th
                        key={h}
                        className="px-4 py-3 text-left text-xs font-semibold text-[#475569] whitespace-nowrap"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EEF0F6]">
                  {files.map((file) => (
                    <tr
                      key={`${file.node_name}-${file.filename}`}
                      className="hover:bg-[#F8F9FC] transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-[#0F172A]">{file.node_name}</span>
                          <Badge variant={file.type as 'mikrotik' | 'database' | 'virtualizor_db'}>{file.type === 'virtualizor_db' ? 'Virtualizor' : file.type}</Badge>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-[#0F172A]">
                        {file.filename}
                      </td>
                      <td className="px-4 py-3 text-[#475569] text-xs whitespace-nowrap">
                        {file.size_human}
                      </td>
                      <td className="px-4 py-3 text-[#475569] text-xs whitespace-nowrap">
                        {formatDatetimeWIB(file.created_at)}
                      </td>
                      {isOperator && (
                        <td className="px-4 py-3">
                          <a
                            href={file.download_url}
                            download={file.filename}
                            className="inline-flex items-center gap-1.5 px-3.5 min-h-[40px] bg-[#EEF0FE] hover:bg-[#E0E3FF] text-[#2E3AC2] rounded-xl text-[13px] font-semibold transition-colors"
                            title={`Unduh ${file.filename}`}
                          >
                            <Download className="w-4 h-4" />
                            Unduh
                          </a>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          {meta && meta.last_page > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-[#475569]">
                {(meta.current_page - 1) * meta.per_page + 1}–
                {Math.min(meta.current_page * meta.per_page, meta.total)} dari {meta.total} file
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={meta.current_page === 1}
                  aria-label="Halaman sebelumnya"
                  className="w-11 h-11 rounded-full bg-white border border-[#E2E4EC] text-[#334155] hover:bg-[#F1F2F7] flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-sm text-[#0F172A] font-medium">
                  {meta.current_page} / {meta.last_page}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(meta.last_page, p + 1))}
                  disabled={meta.current_page === meta.last_page}
                  aria-label="Halaman berikutnya"
                  className="w-11 h-11 rounded-full bg-white border border-[#E2E4EC] text-[#334155] hover:bg-[#F1F2F7] flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
