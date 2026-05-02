import { useState } from 'react'
import { Download, HardDrive, ChevronLeft, ChevronRight, FileArchive } from 'lucide-react'
import { useBackupFiles } from '../hooks/useBackupFiles'
import { useNodes } from '../hooks/useNodes'
import { Badge } from '../components/ui/badge'
import type { BackupFileItem } from '../types'

const PER_PAGE = 20

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Jakarta',
    }) + ' WIB'
  } catch {
    return iso
  }
}

function FileCard({ file }: { file: BackupFileItem }) {
  return (
    <div className="card p-4 flex items-start gap-3">
      <div className="p-2 rounded-lg bg-[#EFF6FF] flex-shrink-0">
        <FileArchive className="w-4 h-4 text-[#0077FF]" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-[#0F172A] truncate">{file.filename}</p>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <Badge variant={file.type as 'mikrotik' | 'database'}>{file.type}</Badge>
          <span className="text-xs text-[#64748B]">{file.node_name}</span>
          <span className="text-xs text-[#64748B]">{file.size_human}</span>
        </div>
        <p className="text-xs text-[#94A3B8] mt-1">{formatDate(file.created_at)}</p>
      </div>
      <a
        href={file.download_url}
        download={file.filename}
        className="p-2 rounded-md bg-[#0077FF] hover:bg-[#0060CC] text-white transition-colors flex-shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center"
        title="Download"
      >
        <Download className="w-4 h-4" />
      </a>
    </div>
  )
}

export default function BackupFilesPage() {
  const [nodeId, setNodeId] = useState('')
  const [type, setType] = useState<'mikrotik' | 'database' | ''>('')
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
    <div className="space-y-6 max-w-screen-xl">
      <div>
        <h1 className="text-2xl font-display font-bold text-[#0F172A]">Backup Files</h1>
        <p className="text-sm text-[#64748B] mt-1">Download file backup per node</p>
      </div>

      {/* Filters */}
      <div className="card p-4 flex flex-wrap gap-3">
        <select
          value={nodeId}
          onChange={(e) => handleFilterChange(setNodeId, e.target.value)}
          className="flex-1 min-w-[160px] px-3 py-2 bg-white border border-[#E2E8F0] rounded-md text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#0077FF]"
        >
          <option value="">All Nodes</option>
          {nodes.map((n) => (
            <option key={n.id} value={n.id}>
              {n.name}
            </option>
          ))}
        </select>
        <div className="flex gap-1">
          {(['', 'mikrotik', 'database'] as const).map((t) => (
            <button
              key={t}
              onClick={() => handleFilterChange(setType, t)}
              className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                type === t
                  ? 'bg-[#0077FF] text-white'
                  : 'bg-[#F8FAFC] text-[#64748B] hover:bg-[#EFF6FF] hover:text-[#0077FF]'
              }`}
            >
              {t === '' ? 'All' : t === 'mikrotik' ? 'MikroTik' : 'Database'}
            </button>
          ))}
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="card p-8 text-center text-[#64748B] text-sm animate-pulse">
          Loading...
        </div>
      )}

      {/* Empty */}
      {!isLoading && files.length === 0 && (
        <div className="card p-16 text-center">
          <HardDrive className="w-12 h-12 text-[#CBD5E1] mx-auto mb-4" />
          <p className="text-[#64748B] font-medium">Belum ada file backup tersedia.</p>
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
          <div className="card hidden md:block overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0]">
                    {['Node', 'Filename', 'Ukuran', 'Tanggal', 'Download'].map((h) => (
                      <th
                        key={h}
                        className="px-4 py-3 text-left text-xs font-semibold text-[#64748B] uppercase tracking-wider"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F1F5F9]">
                  {files.map((file) => (
                    <tr
                      key={`${file.node_name}-${file.filename}`}
                      className="hover:bg-[#F8FAFC] transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-[#0F172A]">{file.node_name}</span>
                          <Badge variant={file.type as 'mikrotik' | 'database'}>{file.type}</Badge>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-[#0F172A]">
                        {file.filename}
                      </td>
                      <td className="px-4 py-3 text-[#64748B] text-xs whitespace-nowrap">
                        {file.size_human}
                      </td>
                      <td className="px-4 py-3 text-[#64748B] text-xs whitespace-nowrap">
                        {formatDate(file.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        <a
                          href={file.download_url}
                          download={file.filename}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#EFF6FF] hover:bg-[#0077FF] text-[#0077FF] hover:text-white rounded-md text-xs font-medium transition-colors"
                          title={`Download ${file.filename}`}
                        >
                          <Download className="w-3.5 h-3.5" />
                          Download
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          {meta && meta.last_page > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-[#64748B]">
                {(meta.current_page - 1) * meta.per_page + 1}–
                {Math.min(meta.current_page * meta.per_page, meta.total)} dari {meta.total} file
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={meta.current_page === 1}
                  className="p-2 rounded-md border border-[#E2E8F0] text-[#64748B] hover:bg-[#F8FAFC] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-sm text-[#0F172A] font-medium">
                  {meta.current_page} / {meta.last_page}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(meta.last_page, p + 1))}
                  disabled={meta.current_page === meta.last_page}
                  className="p-2 rounded-md border border-[#E2E8F0] text-[#64748B] hover:bg-[#F8FAFC] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
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
