/**
 * PATCH: frontend/src/types/index.ts
 *
 * Perubahan:
 * 1. NodeType: tambah 'virtualizor_db'
 * 2. BackupFileItem.type: tambah 'virtualizor_db'
 *
 * Semua perubahan ditandai dengan komentar // <-- PATCH
 */

export type UserRole = 'admin' | 'operator' | 'viewer'
export type NodeType = 'mikrotik' | 'database' | 'virtualizor_db'  // <-- PATCH
export type BackupStatus = 'pending' | 'running' | 'success' | 'failed'

export interface User {
  id: string
  username: string
  email: string
  role: UserRole
  is_active: boolean
  created_at?: string
}

export interface Node {
  id: string
  name: string
  type: NodeType
  host: string
  port: number
  ssh_user?: string
  ssh_key_path?: string
  db_name?: string     // untuk virtualizor_db: opsional override path backup dir
  db_user?: string
  schedule_interval_hours: number
  is_active: boolean
  last_backup_at?: string | null
  latest_log?: BackupLog | null
  next_run_at?: string | null
  schedule?: NodeSchedule | null
}

export interface BackupLog {
  id: string
  node_id?: string
  status: BackupStatus
  file_path?: string | null
  file_size?: number | null
  file_size_formatted?: string
  duration_seconds?: number | null
  error_message?: string | null
  started_at?: string | null
  finished_at?: string | null
  created_at?: string | null
}

export interface BackupFile {
  filename: string
  size: number
  modified_at: string
}

export interface BackupFileItem {
  node_id: string | null
  node_name: string
  type: 'mikrotik' | 'database' | 'virtualizor_db'  // <-- PATCH
  filename: string
  size: number
  size_human: string
  created_at: string
  download_url: string
}

export interface BackupFilesResponse {
  data: BackupFileItem[]
  meta: {
    total: number
    per_page: number
    current_page: number
    last_page: number
  }
}

export interface NodeSchedule {
  id: number
  node_id: string
  next_run_at?: string | null
  last_run_at?: string | null
  interval_hours: number
}

export interface VpsMetric {
  id?: number
  recorded_at: string
  cpu_usage_percent: number
  memory_used_mb: number
  memory_total_mb: number
  disk_used_gb: number
  disk_total_gb: number
  load_average: number
}

export interface NodeStats {
  total: number
  success: number
  failed: number
  unknown: number
}

export interface NodeFormData {
  name: string
  type: NodeType
  host: string
  port: number
  ssh_user: string
  ssh_password: string
  ssh_key_path: string
  db_name: string      // untuk virtualizor_db: isi path backup dir (kosong = default)
  db_user: string
  db_password: string
  schedule_interval_hours: number
}

export interface NodeDetailResponse {
  data: Node
  logs: BackupLog[]
  backup_files: BackupFile[]
}

export interface NodesResponse {
  data: Node[]
  stats: NodeStats
}

export interface VpsMetricsResponse {
  data: VpsMetric[]
  latest: VpsMetric | null
}
