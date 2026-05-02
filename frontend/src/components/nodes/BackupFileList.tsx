import { Download, FileArchive } from 'lucide-react'
import type { BackupFile } from '../../types'
import { formatBytes } from '../../lib/utils'

interface BackupFileListProps {
  files: BackupFile[]
  nodeId: string
}

export function BackupFileList({ files, nodeId }: BackupFileListProps) {
  if (files.length === 0) {
    return (
      <div className="text-center py-10 text-slate-500 text-sm font-mono">
        No backup files found
      </div>
    )
  }

  return (
    <div className="divide-y divide-slate-800">
      {files.map((file) => (
        <div
          key={file.filename}
          className="flex items-center justify-between px-4 py-3 hover:bg-slate-800/30 group"
        >
          <div className="flex items-center gap-3 min-w-0">
            <FileArchive className="w-4 h-4 text-slate-500 flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-mono text-slate-300 truncate">
                {file.filename}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                {file.modified_at} · {formatBytes(file.size)}
              </p>
            </div>
          </div>
          <a
            href={`/api/nodes/${nodeId}/download/${file.filename}`}
            download
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded hover:bg-blue-900/50 text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 ml-4"
          >
            <Download className="w-3.5 h-3.5" />
            Download
          </a>
        </div>
      ))}
    </div>
  )
}
