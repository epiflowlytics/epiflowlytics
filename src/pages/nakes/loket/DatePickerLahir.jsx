import { useState, useRef, useEffect } from 'react'

const NAMA_BULAN = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
]
const NAMA_HARI = ['Sn', 'Sl', 'Rb', 'Km', 'Jm', 'Sb', 'Mg']

function formatTanggalTampil(value) {
  if (!value) return ''
  const [y, m, d] = value.split('-').map(Number)
  return `${d} ${NAMA_BULAN[m - 1]} ${y}`
}

function buatGridHari(tahun, bulan) {
  // bulan: 0-11
  const firstDay = new Date(tahun, bulan, 1)
  // Senin = 0 ... Minggu = 6
  const offset = (firstDay.getDay() + 6) % 7
  const jumlahHari = new Date(tahun, bulan + 1, 0).getDate()
  const jumlahHariBulanLalu = new Date(tahun, bulan, 0).getDate()

  const sel = []
  for (let i = offset - 1; i >= 0; i--) {
    sel.push({ hari: jumlahHariBulanLalu - i, luar: true, arah: -1 })
  }
  for (let d = 1; d <= jumlahHari; d++) {
    sel.push({ hari: d, luar: false, arah: 0 })
  }
  while (sel.length % 7 !== 0 || sel.length < 42) {
    const d = sel.length - (offset + jumlahHari) + 1
    sel.push({ hari: d, luar: true, arah: 1 })
    if (sel.length >= 42) break
  }
  return sel
}

export default function DatePickerLahir({ name, value, onChange, className }) {
  const [buka, setBuka] = useState(false)
  const [mode, setMode] = useState('tanggal') // 'tanggal' | 'bulan' | 'tahun'
  const containerRef = useRef(null)

  const today = new Date()
  const initial = value ? new Date(value) : today
  const [viewTahun, setViewTahun] = useState(initial.getFullYear())
  const [viewBulan, setViewBulan] = useState(initial.getMonth())
  const [tahunPageStart, setTahunPageStart] = useState(Math.floor(initial.getFullYear() / 12) * 12)

  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setBuka(false)
        setMode('tanggal')
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function pilihTanggal(hari) {
    const tgl = `${viewTahun}-${String(viewBulan + 1).padStart(2, '0')}-${String(hari).padStart(2, '0')}`
    onChange({ target: { name, value: tgl } })
    setBuka(false)
    setMode('tanggal')
  }

  function gantiBulan(delta) {
    let b = viewBulan + delta
    let t = viewTahun
    if (b < 0) { b = 11; t -= 1 }
    if (b > 11) { b = 0; t += 1 }
    setViewBulan(b)
    setViewTahun(t)
  }

  function gantiTahun(delta) {
    setViewTahun((t) => t + delta)
  }

  const grid = buatGridHari(viewTahun, viewBulan)
  const [yTerpilih, mTerpilih, dTerpilih] = value ? value.split('-').map(Number) : [null, null, null]

  const tahunList = Array.from({ length: 12 }, (_, i) => tahunPageStart + i)

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setBuka((b) => !b)}
        className={
          className ||
          'w-full border rounded-lg px-3 py-2 text-sm text-left bg-white flex items-center justify-between'
        }
      >
        <span className={value ? 'text-gray-800' : 'text-gray-400'}>
          {value ? formatTanggalTampil(value) : 'Pilih tanggal lahir'}
        </span>
        <span className="text-gray-400">📅</span>
      </button>

      {buka && (
        <div className="absolute z-50 mt-1 w-72 bg-white border border-gray-200 rounded-xl shadow-lg p-3">
          {/* Header navigasi */}
          <div className="flex items-center justify-between mb-2">
            <button
              type="button"
              onClick={() => (mode === 'tahun' ? setTahunPageStart((t) => t - 12) : gantiTahun(-1))}
              className="w-7 h-7 flex items-center justify-center rounded hover:bg-gray-100 text-gray-500"
            >
              «
            </button>
            <button
              type="button"
              onClick={() => (mode === 'tanggal' ? gantiBulan(-1) : undefined)}
              className={`w-7 h-7 flex items-center justify-center rounded hover:bg-gray-100 text-gray-500 ${
                mode !== 'tanggal' ? 'invisible' : ''
              }`}
            >
              ‹
            </button>

            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setMode(mode === 'bulan' ? 'tanggal' : 'bulan')}
                className="text-sm font-semibold px-2 py-1 rounded hover:bg-gray-100 text-gray-700"
              >
                {NAMA_BULAN[viewBulan].slice(0, 3)}
              </button>
              <button
                type="button"
                onClick={() => {
                  setTahunPageStart(Math.floor(viewTahun / 12) * 12)
                  setMode(mode === 'tahun' ? 'tanggal' : 'tahun')
                }}
                className="text-sm font-semibold px-2 py-1 rounded hover:bg-gray-100 text-gray-700"
              >
                {viewTahun}
              </button>
            </div>

            <button
              type="button"
              onClick={() => (mode === 'tanggal' ? gantiBulan(1) : undefined)}
              className={`w-7 h-7 flex items-center justify-center rounded hover:bg-gray-100 text-gray-500 ${
                mode !== 'tanggal' ? 'invisible' : ''
              }`}
            >
              ›
            </button>
            <button
              type="button"
              onClick={() => (mode === 'tahun' ? setTahunPageStart((t) => t + 12) : gantiTahun(1))}
              className="w-7 h-7 flex items-center justify-center rounded hover:bg-gray-100 text-gray-500"
            >
              »
            </button>
          </div>

          {/* Grid tanggal */}
          {mode === 'tanggal' && (
            <div>
              <div className="grid grid-cols-7 text-center text-xs text-gray-400 mb-1">
                {NAMA_HARI.map((h) => (
                  <div key={h} className="py-1">{h}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 text-center text-sm gap-y-1">
                {grid.map((cell, idx) => {
                  const isToday =
                    !cell.luar &&
                    viewTahun === today.getFullYear() &&
                    viewBulan === today.getMonth() &&
                    cell.hari === today.getDate()
                  const isSelected =
                    !cell.luar &&
                    viewTahun === yTerpilih &&
                    viewBulan + 1 === mTerpilih &&
                    cell.hari === dTerpilih
                  return (
                    <button
                      type="button"
                      key={idx}
                      disabled={cell.luar}
                      onClick={() => !cell.luar && pilihTanggal(cell.hari)}
                      className={`h-8 rounded-md transition ${
                        cell.luar
                          ? 'text-gray-300 cursor-default'
                          : isSelected
                          ? 'bg-teal-600 text-white font-semibold'
                          : isToday
                          ? 'text-teal-600 font-semibold hover:bg-teal-50'
                          : 'text-gray-700 hover:bg-teal-50'
                      }`}
                    >
                      {cell.hari}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Pilih bulan */}
          {mode === 'bulan' && (
            <div className="grid grid-cols-3 gap-2">
              {NAMA_BULAN.map((nama, idx) => (
                <button
                  type="button"
                  key={nama}
                  onClick={() => {
                    setViewBulan(idx)
                    setMode('tanggal')
                  }}
                  className={`py-2 rounded-lg text-sm ${
                    idx === viewBulan
                      ? 'bg-teal-600 text-white font-semibold'
                      : 'text-gray-700 hover:bg-teal-50'
                  }`}
                >
                  {nama.slice(0, 3)}
                </button>
              ))}
            </div>
          )}

          {/* Pilih tahun */}
          {mode === 'tahun' && (
            <div className="grid grid-cols-3 gap-2">
              {tahunList.map((t) => (
                <button
                  type="button"
                  key={t}
                  onClick={() => {
                    setViewTahun(t)
                    setMode('tanggal')
                  }}
                  className={`py-2 rounded-lg text-sm ${
                    t === viewTahun
                      ? 'bg-teal-600 text-white font-semibold'
                      : 'text-gray-700 hover:bg-teal-50'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
