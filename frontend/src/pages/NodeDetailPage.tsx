import React, { useEffect, useState } from 'react'
import { useParams, useSearchParams, Link } from 'react-router-dom'
import { Play, Terminal } from 'lucide-react'
import { useBatalkanBackup, useNode, useRefreshDevice, useTriggerBackup } from '../hooks/useNodes'
import { useAuth } from '../context/AuthContext'
import { useBackupWatcher, isRunning } from '../hooks/useBackupWatcher'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { LogViewer } from '../components/logs/LogViewer'
import { BackupFileList } from '../components/nodes/BackupFileList'
import { RemoteTerminal } from '../components/nodes/RemoteTerminal'
import { SimulasiPanel } from '../components/nodes/SimulasiPanel'
import { DoctorPanel, PeranBadges } from '../components/nodes/DoctorPanel'
import { ProsesBackup } from '../components/nodes/ProsesBackup'
import { keadaan, useManual, lepasManual } from '../lib/prosesBackup'
import { toast } from '../components/ui/toaster'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../components/ui/alert-dialog'
import { cn, formatDatetimeWIB, formatBytes, formatDuration } from '../lib/utils'
import type { BackupStatus } from '../types'

type Tab = 'logs' | 'files' | 'doctor' | 'simulasi'

const STATUS: Record<BackupStatus, { teks: string; gaya: string }> = {
  success: { teks: 'Berhasil', gaya: 'bg-[#BBF7D0] text-[#14532D]' },
  failed: { teks: 'Gagal', gaya: 'bg-[#DC2626] text-white' },
  running: { teks: 'Berjalan', gaya: 'bg-[#E0E3FF] text-[#2E3AC2]' },
  pending: { teks: 'Antre', gaya: 'bg-[#E0E3FF] text-[#2E3AC2]' },
  cancelled: { teks: 'Dibatalkan', gaya: 'bg-[#E5E7EB] text-[#374151]' },
}

function Kartu({ judul, pill, nilai, children }: {
  judul: string
  pill?: { teks: string; gaya: string } | null
  nilai: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <section className="card p-5 flex flex-col gap-2.5 min-w-0">
      <div className="flex justify-between items-center gap-2">
        <h2 className="text-[15px] font-bold text-[#334155]">{judul}</h2>
        {pill && <span className={cn('pill', pill.gaya)}>{pill.teks}</span>}
      </div>
      <span className="text-[22px] md:text-[26px] leading-tight font-extrabold tracking-tight break-words">{nilai}</span>
      <div className="text-[13px] text-[#475569] leading-relaxed">{children}</div>
    </section>
  )
}

export default function NodeDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data, isLoading, error, refetch } = useNode(id!)

  // Respons detail menaruh riwayat di `logs`, bukan `latest_log`, jadi bentuknya
  // disesuaikan di sini. Dipanggil sebelum early return agar urutan hook tetap.
  useBackupWatcher(
    data ? [{ id: data.data.id, name: data.data.name, latest_log: data.logs?.[0] ?? null }] : undefined,
  )
  const { isAdmin, isOperator } = useAuth()
  const trigger = useTriggerBackup()
  const batalkan = useBatalkanBackup()
  const [tanyaBatal, setTanyaBatal] = useState(false)
  const [showTerminal, setShowTerminal] = useState(false)
  // ?tab=doctor dipakai halaman Doctor supaya langsung membuka laporan node ini.
  const [searchParams] = useSearchParams()
  const [activeTab, setActiveTab] = useState<Tab>((searchParams.get('tab') as Tab | null) ?? 'logs')
  const refreshDevice = useRefreshDevice()
  const manual = useManual().find((m) => m.id === id)

  // Versi RouterOS dibaca langsung dari router saat halaman dibuka, kecuali baru saja
  // dibaca (5 menit): backup terjadwal juga memperbaruinya.
  const nodeData = data?.data
  useEffect(() => {
    if (nodeData?.type !== 'mikrotik') return
    const umur = nodeData.routeros_checked_at
      ? Date.now() - new Date(nodeData.routeros_checked_at).getTime()
      : Infinity
    if (umur > 5 * 60_000) refreshDevice.mutate(nodeData.id)
  }, [nodeData?.id])

  const handleBackup = async () => {
    try {
      await trigger.mutateAsync({ id: id!, name: data?.data.name ?? '', logTerakhir: data?.logs?.[0]?.id ?? null })
    } catch (err: any) {
      toast(err.response?.data?.message ?? 'Gagal memulai backup', 'error')
    }
  }

  const handleBatal = async () => {
    try {
      const r = await batalkan.mutateAsync(id!)
      toast(r.data?.message ?? 'Backup dihentikan', 'info')
    } catch (err: any) {
      toast(err.response?.data?.message ?? 'Gagal membatalkan backup', 'error')
    } finally {
      setTanyaBatal(false)
    }
  }

  if (isLoading) {
    return (
      <div className="text-center py-16 text-[#475569] text-sm animate-pulse">
        Memuat node...
      </div>
    )
  }

  if (error || !data) {
    const status = (error as { response?: { status?: number } } | null)?.response?.status
    const message =
      status === 404
        ? 'Node tidak ditemukan.'
        : status
          ? `Gagal memuat node (HTTP ${status}).`
          : 'Gagal terhubung ke server. Periksa koneksi lalu coba lagi.'
    return (
      <div className="text-center py-16 space-y-3">
        <p className="text-[#991B1B] text-sm">{message}</p>
        <button
          onClick={() => refetch()}
          className="px-4 py-2 text-sm font-semibold rounded-[14px] bg-white border border-[#DADDE8] hover:bg-[#F4F5FA] min-h-[44px]"
        >
          Coba lagi
        </button>
      </div>
    )
  }

  const node = data.data
  const latestLog = data.logs?.[0]
  const suksesTerakhir = data.logs?.find((l) => l.status === 'success')

  const ringkas = node.doctor_report?.ringkasan
  const totalCek = ringkas ? ringkas.kritis + ringkas.peringatan + ringkas.info + ringkas.ok : 0
  // Riwayat terbaru di kanan, seperti garis waktu.
  const riwayat = (data.logs ?? []).slice(0, 30).reverse()
  const proses = keadaan(node, latestLog, manual)
  // Perkiraan durasi: median 10 backup berhasil terakhir.
  const durasiSukses = (data.logs ?? []).filter((l) => l.status === 'success' && l.duration_seconds != null)
    .slice(0, 10).map((l) => l.duration_seconds!).sort((a, b) => a - b)
  const biasanya = durasiSukses.length ? durasiSukses[Math.floor(durasiSukses.length / 2)] : null
  const PULIH = {
    siap: { teks: 'Siap', gaya: 'bg-[#BBF7D0] text-[#14532D]', nilai: 'Utuh, cocok' },
    perhatian: { teks: 'Perhatian', gaya: 'bg-[#FEF3C7] text-[#92400E]', nilai: 'Bisa, dengan catatan' },
    'tidak-bisa': { teks: 'Tidak bisa', gaya: 'bg-[#DC2626] text-white', nilai: 'Tidak cocok' },
  } as const
  const gagal = riwayat.filter((l) => l.status === 'failed').length

  return (
    <div className="space-y-5 max-w-screen-2xl">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[13px] text-[#475569] mb-1.5">
            <Link to="/devices" className="text-[#3442D9] hover:underline">Perangkat</Link> / {node.name}
          </p>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-[28px] leading-tight font-extrabold break-all">{node.name}</h1>
            <Badge variant={node.type}>{node.type}</Badge>
            {!node.is_active && <span className="pill bg-[#E5E7EB] text-[#374151]">nonaktif</span>}
            <PeranBadges peran={node.doctor_report?.peran} />
          </div>
          <p className="text-[13px] text-[#475569] font-mono mt-1.5 break-all">
            {node.host}:{node.port}
            {node.ssh_user && ` · ssh ${node.ssh_user}`}
          </p>
        </div>
        <div className="flex items-center gap-2.5 flex-wrap">
          {isAdmin && node.type === 'mikrotik' && (
            <Button variant="secondary" onClick={() => setShowTerminal((v) => !v)}>
              <Terminal className="w-4 h-4" />
              {showTerminal ? 'Tutup terminal' : 'Terminal'}
            </Button>
          )}
          {isOperator && node.is_active && (
            <Button onClick={handleBackup} loading={trigger.isPending}>
              <Play className="w-4 h-4" />
              Backup sekarang
            </Button>
          )}
        </div>
      </header>

      {node.type === 'mikrotik' && (
        <section className="card px-5 py-4 flex flex-wrap items-center gap-x-7 gap-y-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-[#475569]">RouterOS</span>
            <span className="font-bold font-mono text-[15px]">{node.routeros_version ?? 'belum terbaca'}</span>
          </div>
          {node.routeros_model && (
            <div className="flex flex-col gap-0.5 min-w-0">
              <span className="text-xs text-[#475569]">Model</span>
              <span className="font-bold text-[15px] break-all">{node.routeros_model}</span>
            </div>
          )}
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-[#475569]">Tipe backup</span>
            <span className="font-bold text-[15px]">{{ rsc: '.rsc export', backup: '.backup biner', keduanya: '.rsc + .backup' }[node.tipe_backup ?? 'rsc']}</span>
          </div>
          <div className="flex items-center gap-3 md:ml-auto flex-wrap">
            <span className="text-[13px] text-[#475569]">
              {refreshDevice.isPending
                ? 'membaca dari router…'
                : node.routeros_checked_at && `dibaca ${formatDatetimeWIB(node.routeros_checked_at)}`}
            </span>
            <button
              onClick={() => refreshDevice.mutate(node.id)}
              disabled={refreshDevice.isPending}
              className="min-h-[40px] px-3.5 rounded-xl bg-[#EEF0FE] text-[#2E3AC2] text-[13px] font-semibold hover:bg-[#E0E3FF] disabled:opacity-50"
            >
              Cek sekarang
            </button>
          </div>
          {refreshDevice.isError && (
            <span className="basis-full text-[13px] text-[#991B1B] break-words">
              {(refreshDevice.error as any)?.response?.data?.message ?? 'Gagal membaca router'}
            </span>
          )}
        </section>
      )}

      {proses && (
        <section className="card p-5 md:p-6 ring-2 ring-[#C7CCFB] relative animate-masuk">
          {proses.fase === 'selesai' && (
            <button
              onClick={() => lepasManual(node.id)}
              className="absolute top-3 right-3 min-h-[36px] px-3 rounded-[10px] text-[13px] font-semibold text-[#475569] hover:bg-[#F1F2F7]"
            >
              Tutup
            </button>
          )}
          <ProsesBackup
            node={node}
            k={proses}
            biasanya={biasanya}
            onBatal={isOperator && node.type === 'database' ? () => setTanyaBatal(true) : undefined}
            membatalkan={batalkan.isPending}
          />
        </section>
      )}

      <AlertDialog open={tanyaBatal} onOpenChange={setTanyaBatal}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Batalkan backup {node.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Semua dump yang sedang berjalan dihentikan dan hasil sementaranya dibuang. Berkas backup lama tidak
              tersentuh, dan jadwal berikutnya tetap berjalan seperti biasa.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setTanyaBatal(false)}>Lanjutkan backup</AlertDialogCancel>
            <AlertDialogAction
              className="bg-[#DC2626] hover:bg-[#B91C1C] text-white"
              onClick={handleBatal}
              disabled={batalkan.isPending}
            >
              {batalkan.isPending ? 'Menghentikan…' : 'Ya, batalkan'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Semua kartu membaca percobaan TERAKHIR (latestLog); umur sukses terakhir
          dimunculkan terpisah justru saat itu penting: ketika percobaan terakhir tidak sukses. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 2xl:grid-cols-4 gap-5 berurutan">
        <Kartu
          judul="Backup"
          pill={latestLog ? STATUS[latestLog.status] : { teks: 'Belum ada', gaya: 'bg-[#E5E7EB] text-[#374151]' }}
          nilai={formatDatetimeWIB(latestLog?.created_at ?? node.last_backup_at)}
        >
          {isRunning(latestLog?.status) ? (
            <span className="font-semibold text-[#2E3AC2]">Sedang berjalan, lihat proses di atas.</span>
          ) : (
            <>
              Percobaan terakhir. Jadwal tiap {node.schedule_interval_hours} jam
              {node.schedule?.next_run_at && <>, berikutnya {formatDatetimeWIB(node.schedule.next_run_at)}</>}.
              {latestLog && latestLog.status !== 'success' && (
                <span className="block mt-1 font-semibold text-[#92400E]">
                  {node.last_backup_at ? `Sukses terakhir ${formatDatetimeWIB(node.last_backup_at)}` : 'Belum pernah sukses'}
                </span>
              )}
            </>
          )}
        </Kartu>
        {/* Dari backup SUKSES terakhir: percobaan gagal tidak menghasilkan berkas. */}
        <Kartu
          judul="Berkas terakhir"
          nilai={suksesTerakhir ? formatBytes(suksesTerakhir.file_size) : 'Belum ada'}
        >
          {suksesTerakhir ? (
            <>
              {formatDatetimeWIB(suksesTerakhir.created_at)}, durasi {formatDuration(suksesTerakhir.duration_seconds)}
              {suksesTerakhir.routeros_version && <>, RouterOS <span className="font-mono">{suksesTerakhir.routeros_version}</span></>}.
            </>
          ) : 'Belum ada backup yang berhasil.'}
        </Kartu>
        {node.type === 'mikrotik' && (
          <Kartu
            judul="Konfigurasi"
            pill={ringkas ? (ringkas.kritis ? { teks: `${ringkas.kritis} kritis`, gaya: 'bg-[#DC2626] text-white' } : { teks: 'Aman', gaya: 'bg-[#BBF7D0] text-[#14532D]' }) : null}
            nilai={ringkas ? `${ringkas.ok} dari ${totalCek} lulus` : node.doctor_report?.galat ? 'Gagal diperiksa' : 'Belum diperiksa'}
          >
            {ringkas
              ? <>{ringkas.peringatan} perhatian. Diperiksa Doctor {formatDatetimeWIB(node.doctor_checked_at)}.</>
              : 'Doctor berjalan otomatis tiap backup berhasil.'}
          </Kartu>
        )}
        <Kartu
            judul="Pulih"
            pill={node.pulih ? PULIH[node.pulih.putusan] : null}
            nilai={node.pulih ? PULIH[node.pulih.putusan].nilai : 'Belum ada'}
          >
            {!node.pulih
              ? 'Belum ada backup berhasil yang bisa dipulihkan.'
              : node.type !== 'mikrotik'
                ? 'Dump terbaru lengkap dan sudah diperiksa saat dibuat.'
                : node.pulih.putusan === 'siap'
                  ? 'Backup terbaru utuh, model dan versinya cocok dengan router sekarang.'
                  : 'Ada catatan sebelum memulihkan.'}
            {node.type === 'mikrotik' && (
              <button onClick={() => setActiveTab('simulasi')} className="block mt-1 font-semibold text-[#3442D9] hover:underline">
                Lihat simulasi restore
              </button>
            )}
          </Kartu>
      </div>

      {riwayat.length > 1 && (
        <section className="card p-5 md:p-6 flex flex-col gap-3.5">
          <div className="flex justify-between items-start gap-3 flex-wrap">
            <div>
              <h2 className="text-lg font-bold">{riwayat.length} backup terakhir</h2>
              <p className="text-[13px] text-[#475569] mt-1">Satu blok satu percobaan, terbaru di kanan</p>
            </div>
            <div className="flex gap-4 text-[13px] text-[#334155]">
              <span className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-[3px] bg-[#4255F0]" />Berhasil {riwayat.length - gagal}</span>
              <span className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-[3px] bg-[#DC2626]" />Gagal {gagal}</span>
            </div>
          </div>
          <div role="img" aria-label={`${riwayat.length - gagal} berhasil, ${gagal} gagal`} className="flex gap-1 h-10">
            {riwayat.map((l) => (
              <span
                key={l.id}
                title={`${formatDatetimeWIB(l.created_at)} · ${STATUS[l.status].teks}`}
                className={cn('flex-1 max-w-[28px] rounded-[5px] origin-bottom animate-[masuk_0.4s_ease-out_backwards]', l.status === 'failed' ? 'bg-[#DC2626]' : l.status === 'success' ? 'bg-[#4255F0]' : l.status === 'cancelled' ? 'bg-[#CBD5E1]' : 'bg-[#C7CCFB]')}
              />
            ))}
          </div>
        </section>
      )}

      {showTerminal && isAdmin && node.type === 'mikrotik' && (
        <RemoteTerminal nodeId={node.id} nodeName={node.name} />
      )}

      <section className="card overflow-hidden">
        <div role="tablist" className="flex gap-1.5 px-3 pt-2.5 border-b border-[#EEF0F6] overflow-x-auto">
          {(node.type === 'mikrotik' ? (['logs', 'files', 'doctor', 'simulasi'] as const) : (['logs', 'files', 'simulasi'] as const)).map((tab) => (
            <button
              key={tab}
              role="tab"
              aria-selected={activeTab === tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                'px-4 min-h-[48px] text-sm whitespace-nowrap border-b-[3px] -mb-px transition-colors',
                activeTab === tab
                  ? 'text-[#2E3AC2] font-bold border-[#4255F0]'
                  : 'text-[#475569] font-semibold border-transparent hover:text-[#0F172A]',
              )}
            >
              {tab === 'logs' && <>Riwayat ({data.logs?.length ?? 0})</>}
              {tab === 'files' && <>Berkas ({data.backup_files?.length ?? 0})</>}
              {tab === 'doctor' && (
                <>
                  Doctor
                  {(ringkas?.kritis ?? 0) > 0 && (
                    <span className="pill ml-1.5 bg-[#DC2626] text-white text-[11px]">{ringkas!.kritis}</span>
                  )}
                </>
              )}
              {tab === 'simulasi' && <>Simulasi &amp; Pemulihan</>}
            </button>
          ))}
        </div>
        {/* key: isi tab berganti dengan pudar singkat, bukan lompatan. */}
        <div key={activeTab} className="animate-pudar">
          {activeTab === 'logs' && (
            <LogViewer logs={data.logs ?? []} />
          )}
          {activeTab === 'files' && (
            <BackupFileList
              files={data.backup_files ?? []}
              nodeId={node.id}
            />
          )}
          {activeTab === 'doctor' && node.type === 'mikrotik' && (
            <DoctorPanel nodeId={node.id} laporan={node.doctor_report} dicek={node.doctor_checked_at} />
          )}
          {activeTab === 'simulasi' && (
            <SimulasiPanel nodeId={node.id} node={node} files={data.backup_files ?? []} jejak={data.simulasi_terakhir} />
          )}
        </div>
      </section>
    </div>
  )
}
