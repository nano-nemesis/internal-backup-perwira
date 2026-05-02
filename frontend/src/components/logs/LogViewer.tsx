import type { BackupLog } from '../../types'
import { StatusBadge } from '../ui/badge'
import { formatBytes, formatDuration, timeAgo } from '../../lib/utils'

interface LogViewerProps {
  logs: BackupLog[]
}

export function LogViewer({ logs }: LogViewerProps) {
  if (logs.length === 0) {
    return (
      <div className="text-center py-10 text-slate-500 font-mono text-sm">
        No backup logs yet
      </div>
    )
  }

  return (
    <div className="divide-y divide-slate-800">
      {logs.map((log) => (
        <div key={log.id} className="px-4 py-3 hover:bg-slate-800/20">
          <div className="flex items-center gap-3 flex-wrap">
            <StatusBadge status={log.status} />
            <span className="text-xs text-slate-500 font-mono">
              {timeAgo(log.created_at)}
            </span>
            {log.file_size != null && (
              <span className="text-xs text-slate-400">
                {formatBytes(log.file_size)}
              </span>
            )}
            {log.duration_seconds != null && (
              <span className="text-xs text-slate-400">
                {formatDuration(log.duration_seconds)}
              </span>
            )}
            {log.file_path && (
              <span className="text-xs text-slate-500 font-mono truncate max-w-xs">
                {log.file_path}
              </span>
            )}
          </div>
          {log.error_message && (
            <div className="mt-2 text-xs text-red-400 font-mono bg-red-950/20 border border-red-900/30 px-3 py-2 rounded">
              {log.error_message}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
