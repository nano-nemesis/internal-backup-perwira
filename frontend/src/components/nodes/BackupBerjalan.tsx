import { useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { X } from 'lucide-react'
import { useNodes } from '../../hooks/useNodes'
import { keadaan, lepasManual, useManual } from '../../lib/prosesBackup'
import { ProsesBackup } from './ProsesBackup'

/**
 * Panel kecil di pojok layar untuk backup manual yang dipicu dari peramban ini: mengikuti
 * pengguna ke halaman mana pun, tahap demi tahap, lalu menutup sendiri setelah selesai.
 */
export function BackupBerjalan() {
  const manual = useManual()
  const { data } = useNodes()
  const { pathname } = useLocation()

  const daftar = manual.map((m) => {
    const node = data?.data.find((n) => n.id === m.id)
    return { m, node, k: node ? keadaan(node, node.latest_log, m) : null }
  })

  // Hasil tampil sebentar lalu panel ditutup; node yang sudah dihapus langsung dilepas.
  const selesai = daftar.filter((d) => (data && !d.node) || d.k?.fase === 'selesai').map((d) => d.m.id).join(',')
  useEffect(() => {
    if (!selesai) return
    const t = setTimeout(() => selesai.split(',').forEach(lepasManual), 8000)
    return () => clearTimeout(t)
  }, [selesai])

  // Di halaman detail node itu sendiri prosesnya sudah tampil besar.
  const tampil = daftar.filter((d) => d.node && d.k && pathname !== `/devices/${d.m.id}`)
  if (!tampil.length) return null

  // HP: di atas navigasi bawah. Desktop: pojok kanan bawah, tidak menutupi tombol di kepala halaman.
  return (
    <div className="fixed z-40 left-4 right-4 md:left-auto md:right-6 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] md:bottom-6 md:w-[360px] flex flex-col gap-2">
      {tampil.map(({ m, node, k }) => (
        <div key={m.id} className="relative bg-white rounded-[20px] p-4 pr-11 shadow-[0_20px_40px_-18px_rgba(15,23,42,0.45)] animate-geser">
          <Link to={`/devices/${m.id}`} className="block" aria-label={`Buka detail ${m.nama}`}>
            <ProsesBackup node={node!} k={k!} ringkas />
          </Link>
          <button
            onClick={() => lepasManual(m.id)}
            aria-label="Tutup panel proses"
            className="absolute top-2 right-2 w-9 h-9 rounded-full text-[#475569] hover:bg-[#F1F2F7] flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  )
}
