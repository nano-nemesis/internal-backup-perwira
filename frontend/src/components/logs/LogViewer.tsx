import type { BackupLog } from '../../types'
import { StatusBadge } from '../ui/badge'
import { formatBytes, formatDuration, formatLogTime } from '../../lib/utils'

interface LogViewerProps {
  logs: BackupLog[]
}

function colorLine(text: string): string {
  const t = text.toUpperCase()
  if (t.includes('SUCCESS') || t.includes('DONE')) return 'text-[#4ADE80]'
  if (t.includes('ERROR') || t.includes('FAILED') || t.includes('FAIL')) return 'text-[#F87171]'
  if (t.includes('INFO') || t.includes('START') || t.includes('CONNECT')) return 'text-[#8C99F7]'
  return 'text-[#CBD5E1]'
}

export function LogViewer({ logs }: LogViewerProps) {
  if (logs.length === 0) {
    return (
      <div className="text-center py-10 text-[#475569] text-sm">
        Belum ada riwayat backup
      </div>
    )
  }

  return (
    <div className="divide-y divide-[#EEF0F6]">
      {logs.map((log) => (
        <div key={log.id} className="px-5 md:px-6 py-3.5">
          <div className="flex items-center gap-3 flex-wrap">
            <StatusBadge status={log.status} />
            <span className="text-[13px] font-semibold text-[#0F172A]">
              {formatLogTime(log.created_at)}
            </span>
            {log.file_size != null && (
              <span className="text-xs text-[#475569]">
                {formatBytes(log.file_size)}
              </span>
            )}
            {log.duration_seconds != null && (
              <span className="text-xs text-[#475569]">
                {formatDuration(log.duration_seconds)}
              </span>
            )}
            {log.routeros_version && (
              <span className="text-xs text-[#475569] font-mono">
                ROS {log.routeros_version.split(' ')[0]}
              </span>
            )}
            {log.file_path && (
              <span className="text-xs text-[#475569] font-mono truncate max-w-xs">
                {log.file_path}
              </span>
            )}
          </div>
          {log.error_message && (
            <div className="mt-2.5 rounded-[14px] overflow-hidden bg-[#111827]">
              <div className="px-3 py-1.5 bg-[#1F2937] flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#F87171]" />
                <span className="text-xs text-[#CBD5E1]">keluaran galat</span>
              </div>
              <pre className="px-4 py-3 text-xs leading-relaxed font-mono whitespace-pre-wrap break-words overflow-x-auto">
                {log.error_message.split('\n').map((line, i) => (
                  <span key={i} className={`block ${colorLine(line)}`}>
                    {line || ' '}
                  </span>
                ))}
              </pre>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
