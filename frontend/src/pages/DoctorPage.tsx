import { Link } from 'react-router-dom'
import { useNodes, useRunDoctorAll } from '../hooks/useNodes'
import { useAuth } from '../context/AuthContext'
import { Button } from '../components/ui/button'
import { toast } from '../components/ui/toaster'
import { PeranBadges, hitungDoctor } from '../components/nodes/DoctorPanel'
import { formatDatetimeWIB } from '../lib/utils'

export default function DoctorPage() {
  const { data, isLoading } = useNodes()
  const { isOperator } = useAuth()
  const semua = useRunDoctorAll()

  const hitung = hitungDoctor(data?.data ?? [])
  const nodes = hitung.urut

  const periksaSemua = async () => {
    try {
      const r = await semua.mutateAsync()
      toast(`${r.message} — hasilnya muncul bertahap`, 'info')
    } catch (err: any) {
      toast(err.response?.data?.message ?? 'Gagal menjalankan doctor', 'error')
    }
  }

  return (
    <div className="space-y-6 max-w-screen-xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-display font-bold text-[#0F172A]">Doctor</h1>
          <p className="text-sm text-[#475569] mt-1">
            Kesehatan konfigurasi router MikroTik terhadap standar Perwira — keamanan, lisensi CHR,
            PPPoE, VPN/IP publik, dan sistem. Diperbarui otomatis setiap backup.
          </p>
        </div>
        {isOperator && (
          <Button onClick={periksaSemua} loading={semua.isPending}>
            Periksa semua
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          ['Kritis', hitung.kritis, 'text-[#DC2626]'],
          ['Perlu perhatian', hitung.perhatian, 'text-amber-600'],
          ['Sesuai standar', hitung.sehat, 'text-[#16A34A]'],
          ['Belum/gagal diperiksa', hitung.belum, 'text-[#475569]'],
        ].map(([label, n, warna]) => (
          <div key={label as string} className="card p-4">
            <p className="text-xs text-[#475569] font-mono">{label}</p>
            <p className={`text-2xl font-mono font-semibold mt-1 ${warna}`}>{n}</p>
          </div>
        ))}
      </div>

      <div className="card divide-y divide-[#E2E8F0]">
        {isLoading && <p className="p-4 text-sm text-[#475569] font-mono animate-pulse">Memuat…</p>}
        {!isLoading && nodes.length === 0 && (
          <p className="p-4 text-sm text-[#475569] font-mono">Belum ada node MikroTik.</p>
        )}
        {nodes.map((n) => {
          const r = n.doctor?.ringkasan
          return (
            <Link
              key={n.id}
              to={`/devices/${n.id}?tab=doctor`}
              className="flex items-start gap-4 px-4 py-3 hover:bg-[#F8FAFC] transition-colors flex-wrap sm:flex-nowrap"
            >
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-[#0F172A]">{n.name}</span>
                  <PeranBadges peran={n.doctor?.peran} />
                </div>
                <p className="text-sm text-[#475569] break-words">
                  {n.doctor?.galat
                    ? <span className="text-[#DC2626]">Tidak bisa diperiksa: {n.doctor.galat}</span>
                    : n.doctor
                      ? n.doctor.utama ?? 'Sesuai standar.'
                      : 'Belum pernah diperiksa.'}
                </p>
              </div>
              <div className="flex items-center gap-4 text-sm flex-shrink-0">
                {r && (
                  <>
                    <span className="text-[#DC2626]"><span className="font-mono font-semibold">{r.kritis}</span> kritis</span>
                    <span className="text-amber-600"><span className="font-mono font-semibold">{r.peringatan}</span> perhatian</span>
                  </>
                )}
                <span className="text-xs text-[#475569] w-32 text-right hidden md:inline">
                  {n.doctor_checked_at ? formatDatetimeWIB(n.doctor_checked_at) : '—'}
                </span>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
