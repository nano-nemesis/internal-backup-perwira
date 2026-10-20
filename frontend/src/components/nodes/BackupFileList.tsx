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
  // dibatasi operator ke atas, sama seperti penjagaan di sisi API. Viewer tetap
  // melihat daftar dan ukurannya; yang disembunyikan hanya tombolnya.
  const { isOperator } = useAuth()

  if (files.length === 0) {
    return (
      <div className="text-center py-10 text-[#475569] text-sm">
        Belum ada berkas backup
      </div>
    )
  }

  return (
    <div className="divide-y divide-[#EEF0F6]">
      {files.map((file) => (
        <div
          key={file.filename}
          className="flex items-center justify-between px-5 md:px-6 py-3 hover:bg-[#F8F9FC] group"
        >
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-10 h-10 rounded-xl bg-[#F1F2F7] text-[#334155] flex items-center justify-center flex-shrink-0"><FileArchive className="w-[18px] h-[18px]" strokeWidth={1.8} /></span>
            <div className="min-w-0">
              <p className="text-[13px] font-mono font-medium text-[#0F172A] truncate">
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
              aria-label={`Unduh ${file.filename}`}
              className="flex items-center justify-center gap-1.5 px-3.5 text-[13px] font-semibold rounded-xl bg-[#EEF0FE] hover:bg-[#E0E3FF] text-[#2E3AC2] transition-colors flex-shrink-0 ml-4 min-h-[44px] min-w-[44px]"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Unduh</span>
            </a>
          )}
        </div>
      ))}
    </div>
  )
}
