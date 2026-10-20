import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus, Search } from 'lucide-react'
import { Button } from '../components/ui/button'
import { NodeTable } from '../components/nodes/NodeTable'
import { NodeForm } from '../components/nodes/NodeForm'
import { useNodes } from '../hooks/useNodes'
import { useAuth } from '../context/AuthContext'
import type { Node } from '../types'

type Saring = 'semua' | 'masalah' | 'mikrotik' | 'database' | 'virtualizor_db'
type Urut = 'mendesak' | 'nama' | 'terbaru' | 'terlama'

const bermasalah = (n: Node) =>
  n.latest_log?.status === 'failed' || !!n.doctor?.galat || (n.doctor?.ringkasan?.kritis ?? 0) > 0

/** Makin besar makin mendesak: backup gagal, router tak terjangkau, temuan kritis, belum pernah backup. */
const bobot = (n: Node) =>
  (!n.is_active ? -1e9 : 0)
  + (n.latest_log?.status === 'failed' ? 1e6 : 0)
  + (n.doctor?.galat ? 1e5 : 0)
  + (n.doctor?.ringkasan?.kritis ?? 0) * 1e3
  + (!n.latest_log ? 500 : 0)
  + (n.doctor?.ringkasan?.peringatan ?? 0)

const waktu = (n: Node) => Date.parse(n.latest_log?.created_at ?? n.last_backup_at ?? '') || 0
const abjad = (a: Node, b: Node) => a.name.localeCompare(b.name, 'id', { numeric: true, sensitivity: 'base' })

const URUTAN: Record<Urut, (a: Node, b: Node) => number> = {
  mendesak: (a, b) => bobot(b) - bobot(a) || abjad(a, b),
  nama: abjad,
  terbaru: (a, b) => waktu(b) - waktu(a),
  terlama: (a, b) => waktu(a) - waktu(b),
}

export default function DevicesPage() {
  const { data, isLoading, isError, fetchStatus, refetch } = useNodes()
  // fetchStatus 'paused' = React Query menganggap browser offline dan MENUNDA request.
  // Dalam keadaan itu isError tetap false selamanya, jadi cek isError saja masih
  // menampilkan "0 node" ke teknisi yang sinyalnya putus — persis kebohongan yang
  // mau ditutup di sini.
  const loadFailed = isError || fetchStatus === 'paused'
  const [showForm, setShowForm] = useState(false)
  const [editingNode, setEditingNode] = useState<Node | null>(null)
  const { isOperator } = useAuth()
  // Disimpan di URL: kembali dari detail node, pencarian dan urutannya masih sama.
  const [sp, setSp] = useSearchParams()
  const atur = (k: string, v: string, bawaan: string) =>
    setSp((p) => { if (v && v !== bawaan) p.set(k, v); else p.delete(k); return p }, { replace: true })
  const cari = sp.get('q') ?? ''
  const saring = (['semua', 'masalah', 'mikrotik', 'database', 'virtualizor_db'] as const).find((k) => k === sp.get('saring')) ?? 'semua'
  const urut = (Object.keys(URUTAN) as Urut[]).find((k) => k === sp.get('urut')) ?? 'mendesak'
  const setCari = (v: string) => atur('q', v, '')
  const setSaring = (v: Saring) => atur('saring', v, 'semua')
  const setUrut = (v: Urut) => atur('urut', v, 'mendesak')

  const semua = data?.data ?? []
  const jumlah: Record<Saring, number> = {
    semua: semua.length,
    masalah: semua.filter(bermasalah).length,
    mikrotik: semua.filter((n) => n.type === 'mikrotik').length,
    database: semua.filter((n) => n.type === 'database').length,
    virtualizor_db: semua.filter((n) => n.type === 'virtualizor_db').length,
  }
  const tampil = useMemo(() => {
    const q = cari.trim().toLowerCase()
    return semua
      .filter((n) => saring === 'semua' || (saring === 'masalah' ? bermasalah(n) : n.type === saring))
      .filter((n) => !q || n.name.toLowerCase().includes(q) || n.host.toLowerCase().includes(q))
      .sort(URUTAN[urut])
  }, [semua, cari, saring, urut])

  const handleEdit = (node: Node) => {
    setEditingNode(node)
    setShowForm(true)
  }

  const handleClose = () => {
    setShowForm(false)
    setEditingNode(null)
  }

  return (
    <div className="space-y-5 max-w-screen-2xl">
      {loadFailed && (
        <div role="alert" className="rounded-2xl bg-[#FEE2E2] px-4 py-3 text-sm text-[#991B1B] flex items-center justify-between gap-4">
          <span>
            Gagal memuat daftar node, angka di bawah mungkin tidak mencerminkan keadaan
            sebenarnya. Jangan simpulkan node hilang dari daftar kosong.
          </span>
          <button
            onClick={() => refetch()}
            className="px-4 rounded-xl bg-white font-semibold hover:bg-[#FEF2F2] whitespace-nowrap min-h-[44px]"
          >
            Coba lagi
          </button>
        </div>
      )}

      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[28px] leading-tight font-extrabold text-[#0F172A]">Perangkat</h1>
          <p className="text-sm text-[#475569] mt-1">
            {data
              ? `${semua.length} node: ${[
                  jumlah.mikrotik && `${jumlah.mikrotik} MikroTik`,
                  jumlah.database && `${jumlah.database} database`,
                  jumlah.virtualizor_db && `${jumlah.virtualizor_db} Virtualizor`,
                ].filter(Boolean).join(', ')}`
              : 'jumlah node tidak diketahui'}
          </p>
        </div>
        {isOperator && (
          <Button onClick={() => setShowForm(true)}>
            <Plus className="w-4 h-4" />
            Tambah node
          </Button>
        )}
      </div>

      <section className="card p-3 md:p-4 flex flex-wrap items-center gap-3">
        <label className="relative flex-[1_1_240px]">
          <span className="sr-only">Cari router</span>
          <Search className="w-[18px] h-[18px] text-[#475569] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input type="search" value={cari} onChange={(e) => setCari(e.target.value)} placeholder="Cari nama atau IP" className="kotak-cari" />
        </label>
        <div className="flex gap-2 overflow-x-auto -mx-1 px-1 max-w-full">
          {([
            ['semua', 'Semua'],
            ['masalah', 'Bermasalah'],
            ['mikrotik', 'MikroTik'],
            ['database', 'Database'],
            ['virtualizor_db', 'Virtualizor'],
          ] as const)
            .filter(([k]) => k === 'semua' || k === 'masalah' || jumlah[k] > 0)
            .map(([k, label]) => (
              <button key={k} type="button" aria-pressed={saring === k} onClick={() => setSaring(k)} className="chip">
                {label} {jumlah[k]}
              </button>
            ))}
        </div>
        <label className="flex items-center gap-2 text-[13px] font-semibold text-[#475569]">
          Urutkan
          <select value={urut} onChange={(e) => setUrut(e.target.value as Urut)} className="pilih">
            <option value="mendesak">Paling mendesak</option>
            <option value="nama">Nama A–Z</option>
            <option value="terbaru">Backup terbaru</option>
            <option value="terlama">Backup terlama</option>
          </select>
        </label>
      </section>

      <div className="card overflow-hidden lg:pt-1">
        {isLoading ? (
          <div className="p-8 text-center text-[#475569] text-sm animate-pulse">
            Memuat node...
          </div>
        ) : data && semua.length > 0 && tampil.length === 0 ? (
          <div className="p-10 text-center space-y-3">
            <p className="text-sm text-[#475569]">Tidak ada node yang cocok dengan pencarian atau saringan ini.</p>
            <Button variant="secondary" onClick={() => setSp({}, { replace: true })}>Tampilkan semua</Button>
          </div>
        ) : data ? (
          <NodeTable nodes={tampil} semua={semua} onEdit={handleEdit} />
        ) : (
          <div className="p-8 text-center text-[#475569] text-sm">Daftar node tidak bisa dimuat. Ini bukan berarti tidak ada node.</div>
        )}
      </div>

      <NodeForm
        open={showForm}
        onClose={handleClose}
        editingNode={editingNode}
      />
    </div>
  )
}
