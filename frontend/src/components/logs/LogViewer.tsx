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
  if (t.includes('INFO') || t.includes('START') || t.includes('CONNECT')) return 'text-[#60A5FA]'
  return 'text-[#CBD5E1]'
}

export function LogViewer({ logs }: LogViewerProps) {
  if (logs.length === 0) {
    return (
      <div className="text-center py-10 text-[#64748B] text-sm">
        No backup logs yet
      </div>
    )
  }

  return (
    <div className="divide-y divide-[#1E293B]">
      {logs.map((log) => (
        <div key={log.id} className="px-4 py-3 hover:bg-[#1E293B]/10">
          <div className="flex items-center gap-3 flex-wrap">
            <StatusBadge status={log.status} />
            <span className="text-xs text-[#64748B] font-mono">
              {formatLogTime(log.created_at)}
            </span>
            {log.file_size != null && (
              <span className="text-xs text-[#64748B]">
                {formatBytes(log.file_size)}
              </span>
            )}
            {log.duration_seconds != null && (
              <span className="text-xs text-[#64748B]">
                {formatDuration(log.duration_seconds)}
              </span>
            )}
            {log.file_path && (
              <span className="text-xs text-[#64748B] font-mono truncate max-w-xs">
                {log.file_path}
              </span>
            )}
          </div>
          {log.error_message && (
            <div className="mt-2 rounded-md overflow-hidden bg-[#0F172A] border border-[#1E293B]">
              <div className="px-2 py-1 bg-[#1E293B] flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#F87171]" />
                <span className="text-xs font-mono text-[#94A3B8]">error output</span>
              </div>
              <pre className="px-3 py-2 text-xs font-mono whitespace-pre-wrap overflow-x-auto">
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
