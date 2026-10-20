import { useEffect, useRef, useState } from 'react'

const kurangiGerak = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Angka yang menghitung naik ke nilainya saat pertama tampil atau berubah. */
export function Hitung({ n }: { n: number }) {
  const [tampil, setTampil] = useState(() => (kurangiGerak() ? n : 0))
  const dari = useRef(tampil)

  useEffect(() => {
    if (kurangiGerak()) { setTampil(n); dari.current = n; return }
    const awal = dari.current
    const mulai = performance.now()
    let bingkai = 0
    const langkah = (t: number) => {
      const p = Math.min(1, (t - mulai) / 700)
      const nilai = Math.round(awal + (n - awal) * (1 - (1 - p) ** 3))
      setTampil(nilai)
      dari.current = nilai
      if (p < 1) bingkai = requestAnimationFrame(langkah)
    }
    bingkai = requestAnimationFrame(langkah)
    return () => cancelAnimationFrame(bingkai)
  }, [n])

  return <>{tampil.toLocaleString('id-ID')}</>
}
