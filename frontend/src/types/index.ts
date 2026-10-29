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
export type BackupStatus = 'pending' | 'running' | 'success' | 'failed' | 'cancelled'

export interface User {
  id: string
  username: string
  email: string
  role: UserRole
  is_active: boolean
  last_login_at?: string | null
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
  backup_binary?: boolean  // MikroTik: true = tipe backup .backup (biner), false = .rsc
  routeros_version?: string | null  // terakhir dibaca dari router, mis. "7.23.5 (long-term)"
  routeros_model?: string | null
  routeros_checked_at?: string | null
  doctor?: DoctorRingkas | null       // di daftar node: ringkasan saja
  doctor_report?: DoctorReport | null // di detail node: laporan lengkap
  doctor_checked_at?: string | null
  last_backup_at?: string | null
  latest_log?: BackupLog | null
  next_run_at?: string | null
  schedule?: NodeSchedule | null
  /** Lampu Pulih: backup berhasil terakhir bisa dipulihkan ke perangkat sekarang? null = belum ada. */
  pulih?: { putusan: 'siap' | 'perhatian' | 'tidak-bisa'; berkas: string } | null
  created_at?: string | null
}

export interface BackupLog {
  id: string
  node_id?: string
  status: BackupStatus
  /** Tahap yang sedang berjalan (ambil, simpan, salin, dump, kompres, cari, periksa, doctor). */
  tahap?: string | null
  file_path?: string | null
  file_size?: number | null
  file_size_formatted?: string
  duration_seconds?: number | null
  error_message?: string | null
  routeros_version?: string | null  // versi RouterOS saat backup ini dibuat
  started_at?: string | null
  finished_at?: string | null
  created_at?: string | null
}

export interface BackupFile {
  filename: string
  size: number
  modified_at: string
  /** null = belum pernah diverifikasi. */
  verifikasi?: { struktur: HasilStruktur | null; restore: HasilRestore | null } | null
}

export interface ItemCek { status: CekStatus; judul: string; detail: string }

/** Cek struktur berkas (App\Support\VerifikasiBerkas): otomatis tiap backup berhasil. */
export interface HasilStruktur {
  status: CekStatus
  ringkasan: string
  cek: ItemCek[]
  pada: string
}

/** Restore uji ke database sementara (App\Services\UjiRestoreService). */
export interface HasilRestore {
  status: CekStatus | 'berjalan'
  ringkasan?: string
  database?: { db: string; status: CekStatus; detail: string; detik: number; tabel?: number; view?: number; trigger?: number; baris?: number }[]
  galat?: string
  pada: string
  oleh?: string
  detik?: number
}

/** Uji backup tanpa menyimpan berkas (uji() di service tiap tipe). */
export interface HasilUjiBackup {
  status: CekStatus
  langkah: ItemCek[]
  detik: number
  pada: string
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

export type JenisBerkas = 'rsc' | 'backup' | 'sql' | 'lain'
export type UrutBerkas = 'terbaru' | 'terlama' | 'nama' | 'terbesar'

export interface BackupFilesResponse {
  data: BackupFileItem[]
  meta: {
    total: number
    per_page: number
    current_page: number
    last_page: number
  }
  /** Seluruh berkas (tanpa saringan) per jenis, dan kapasitas partisi backup. */
  ringkasan?: {
    jenis: Record<JenisBerkas, { jumlah: number; byte: number }>
    disk: { total: number; bebas: number } | null
    retensi_hari: number
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
  backup_binary: boolean
}

export type HasilTelegram = 'terkirim' | 'dimatikan' | 'jeda' | 'belum-diatur' | 'gagal'

export interface NodeDetailResponse {
  data: Node
  logs: BackupLog[]
  backup_files: BackupFile[]
  /** Jejak simulasi gangguan terakhir (MikroTik). */
  simulasi_terakhir?: {
    waktu: string
    selesai: string | null
    error: string
    log_sistem: { level: string; aksi: string } | null
    sebab: string | null
    telegram: HasilTelegram | null
    pulih: { waktu: string; telegram: HasilTelegram | null } | null
  } | null
}

export interface NodesResponse {
  data: Node[]
  stats: NodeStats
}

export interface VpsMetricsResponse {
  data: VpsMetric[]
  latest: VpsMetric | null
}

export type LogLevel = 'info' | 'warning' | 'error'

export interface ActivityLogItem {
  id: number
  level: LogLevel
  kategori: string
  aksi: string
  pesan: string
  konteks: Record<string, unknown> | null
  user_id: string | null
  username: string | null
  ip: string | null
  node_id: string | null
  node_name: string | null
  created_at: string
}

export interface ActivityLogsResponse {
  data: ActivityLogItem[]
  meta: { current_page: number; last_page: number; per_page: number; total: number }
  ringkasan: Partial<Record<LogLevel, number>>
}

export type CekStatus = 'ok' | 'peringatan' | 'gagal'
export type SkenarioGangguan = 'tak-terjangkau' | 'login-ditolak'

/** Hasil simulasi restore (App\Support\RestoreCheck di backend). */
export interface RestoreCheckResult {
  jenis: 'rsc' | 'backup'
  putusan: 'siap' | 'perhatian' | 'tidak-bisa'
  versi_backup: string | null
  model_backup: string | null
  cek: { status: CekStatus; judul: string; detail: string }[]
  langkah: string[]
  dicek_pada: string | null
}

export type DoctorStatus = 'kritis' | 'peringatan' | 'info' | 'ok'

export interface DoctorCek {
  id: string
  kategori: string
  status: DoctorStatus
  /** Bunyi standarnya, dipakai saat lolos. */
  judul: string
  /** Bunyi pelanggarannya. Laporan lama (sebelum v1.10) tidak punya, pakai judul. */
  masalah?: string
  /** Yang terbaca di router ini. */
  detail: string
  standar?: string
  dampak?: string
  perbaikan?: string
  /** Gambar internet ke router. gerbang = penyaring setelah perbaikan; nanti 'tetap' = tidak berubah oleh perbaikan ini. */
  jalur?: { wan: string; gerbang: string; layanan: { nama: string; port: string; kini: 'terbuka' | 'dibatasi'; nanti: 'noc' | 'vpn' | 'tutup' | 'tetap' }[] }
  meter?: { label: string; nilai: number; batas: number; arah: 'maks' | 'min' }[]
}

/** Laporan doctor (App\Support\RouterDoctor). `galat` terisi kalau router tak terjangkau. */
export interface DoctorRingkas {
  peran?: string[]
  ringkasan?: Record<DoctorStatus, number>
  utama?: string | null
  galat?: string
}

export interface DoctorReport extends DoctorRingkas {
  versi?: string | null
  cek?: DoctorCek[]
}
