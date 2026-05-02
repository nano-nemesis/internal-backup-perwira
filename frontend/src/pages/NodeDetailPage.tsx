import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Play, Terminal } from 'lucide-react'
import { useNode, useTriggerBackup } from '../hooks/useNodes'
import { useAuth } from '../context/AuthContext'
import { Button } from '../components/ui/button'
import { Badge, StatusBadge } from '../components/ui/badge'
import { LogViewer } from '../components/logs/LogViewer'
import { BackupFileList } from '../components/nodes/BackupFileList'
import { RemoteTerminal } from '../components/nodes/RemoteTerminal'
import { toast } from '../components/ui/toaster'
import { formatDatetimeWIB, formatBytes, formatDuration } from '../lib/utils'

type Tab = 'logs' | 'files'

export default function NodeDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data, isLoading, error } = useNode(id!)
  const { isAdmin, isOperator } = useAuth()
  const trigger = useTriggerBackup()
  const [showTerminal, setShowTerminal] = useState(false)
  const [activeTab, setActiveTab] = useState<Tab>('logs')

  const handleBackup = async () => {
    try {
      await trigger.mutateAsync(id!)
      toast('Backup job queued', 'success')
    } catch (err: any) {
      toast(err.response?.data?.message ?? 'Failed to queue backup', 'error')
    }
  }

  if (isLoading) {
    return (
      <div className="text-center py-16 text-slate-500 font-mono text-sm animate-pulse">
        Loading node...
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="text-center py-16 text-red-400 font-mono text-sm">
        Node not found
      </div>
    )
  }

  const node = data.data
  const latestLog = data.logs?.[0]

  return (
    <div className="space-y-6 max-w-screen-xl">
      {/* Header */}
      <div className="flex items-start gap-3">
        <button
          onClick={() => navigate('/devices')}
          className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors mt-0.5"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-mono font-bold text-white">
              {node.name}
            </h1>
            <Badge variant={node.type}>{node.type}</Badge>
            <span
              className={`w-2 h-2 rounded-full ${
                node.is_active ? 'bg-emerald-500' : 'bg-slate-600'
              }`}
            />
            <span className="text-xs text-slate-500 font-mono">
              {node.is_active ? 'active' : 'inactive'}
            </span>
          </div>
          <p className="text-sm text-slate-500 font-mono mt-0.5">
            {node.host}:{node.port}
            {node.ssh_user && ` · ssh ${node.ssh_user}`}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {isAdmin && node.type === 'mikrotik' && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowTerminal((v) => !v)}
            >
              <Terminal className="w-3.5 h-3.5" />
              {showTerminal ? 'Hide Terminal' : 'Terminal'}
            </Button>
          )}
          {isOperator && node.is_active && (
            <Button
              size="sm"
              onClick={handleBackup}
              loading={trigger.isPending}
            >
              <Play className="w-3.5 h-3.5" />
              Backup Now
            </Button>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card p-4">
          <p className="text-xs text-slate-500 font-mono">Last Status</p>
          <div className="mt-2">
            <StatusBadge status={latestLog?.status} />
          </div>
        </div>
        <div className="card p-4">
          <p className="text-xs text-slate-500 font-mono">Last Backup</p>
          <p className="text-sm font-mono text-slate-300 mt-1">
            {formatDatetimeWIB(node.last_backup_at)}
          </p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-slate-500 font-mono">File Size</p>
          <p className="text-sm font-mono text-slate-300 mt-1">
            {formatBytes(latestLog?.file_size)}
          </p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-slate-500 font-mono">Duration · Interval</p>
          <p className="text-sm font-mono text-slate-300 mt-1">
            {formatDuration(latestLog?.duration_seconds)} · {node.schedule_interval_hours}h
          </p>
        </div>
      </div>

      {/* Next run */}
      {node.schedule?.next_run_at && (
        <div className="text-xs text-slate-500 font-mono px-1">
          Next scheduled run:{' '}
          <span className="text-slate-400">
            {formatDatetimeWIB(node.schedule.next_run_at)}
          </span>
        </div>
      )}

      {/* Terminal */}
      {showTerminal && isAdmin && node.type === 'mikrotik' && (
        <RemoteTerminal nodeId={node.id} />
      )}

      {/* Tabs */}
      <div className="card">
        <div className="flex border-b border-slate-700">
          {(['logs', 'files'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-3 text-sm font-mono transition-colors ${
                activeTab === tab
                  ? 'text-blue-400 border-b-2 border-blue-500'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {tab === 'logs' ? (
                <>Backup Logs ({data.logs?.length ?? 0})</>
              ) : (
                <>Backup Files ({data.backup_files?.length ?? 0})</>
              )}
            </button>
          ))}
        </div>
        <div>
          {activeTab === 'logs' && (
            <LogViewer logs={data.logs ?? []} />
          )}
          {activeTab === 'files' && (
            <BackupFileList
              files={data.backup_files ?? []}
              nodeId={node.id}
            />
          )}
        </div>
      </div>
    </div>
  )
}
