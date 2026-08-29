import { Download, FileArchive } from 'lucide-react'
import type { BackupFile } from '../../types'
import { formatBytes } from '../../lib/utils'
import { useAuth } from '../../context/AuthContext'

interface BackupFileListProps {
  files: BackupFile[]
  nodeId: string
}

export function BackupFileList({ files, nodeId }: BackupFileListProps) {
  // Isi berkasnya memuat kredensial pelanggan dalam teks polos, jadi unduhan
  // dibatasi operator ke atas — sama seperti penjagaan di sisi API. Viewer tetap
  // melihat daftar dan ukurannya; yang disembunyikan hanya tombolnya.
  const { isOperator } = useAuth()

  if (files.length === 0) {
    return (
      <div className="text-center py-10 text-[#475569] text-sm font-mono">
        No backup files found
      </div>
    )
  }

  return (
    <div className="divide-y divide-[#E2E8F0]">
      {files.map((file) => (
        <div
          key={file.filename}
          className="flex items-center justify-between px-4 py-3 hover:bg-[#F8FAFC] group"
        >
          <div className="flex items-center gap-3 min-w-0">
            <FileArchive className="w-4 h-4 text-[#475569] flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-mono text-[#0F172A] truncate">
                {file.filename}
              </p>
              <p className="text-xs text-[#475569] mt-0.5">
                {file.modified_at} · {formatBytes(file.size)}
              </p>
            </div>
          </div>
          {isOperator && (
            <a
              href={`/api/nodes/${nodeId}/download/${file.filename}`}
              download
              onClick={(e) => e.stopPropagation()}
              className="flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs rounded hover:bg-[#EFF6FF] text-[#0077FF] transition-colors flex-shrink-0 ml-4 min-h-[44px] min-w-[44px]"
            >
              <Download className="w-3.5 h-3.5" />
              Download
            </a>
          )}
        </div>
      ))}
    </div>
  )
}
