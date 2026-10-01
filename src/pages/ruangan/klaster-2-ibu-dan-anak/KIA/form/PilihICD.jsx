import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../../../../lib/supabaseClient'

// Pilih diagnosis + kode ICD-10 dari tabel ref_icd10.
// Kode hanya bisa dipilih dari daftar (tidak ada ketik bebas), jadi tidak ada salah ketik.
//
// Props:
//   value    : { kode, nama } | null
//   onChange : (item | null) => void
//   disabled : boolean

// Pilihan terakhir di dropdown. Kalau dipilih, dokter menulis diagnosis sendiri
// di kolom teks di bawah dropdown (diatur oleh komponen induk).
export const KODE_LAINNYA = 'LAINNYA'
const ITEM_LAINNYA = {
  kode: KODE_LAINNYA,
  nama: 'Lainnya (diagnosis tidak ada di daftar, tulis di kolom bawah)',
}

const input = {
  fontSize: 13,
  padding: '8px 10px',
  border: '1px solid var(--line, #e5e7eb)',
  borderRadius: 8,
  fontFamily: 'inherit',
  width: '100%',
  boxSizing: 'border-box',
}

// karakter khusus filter PostgREST/ilike dibuang agar query tidak rusak
function bersihkan(q) {
  return q.replace(/[%,()*\\]/g, ' ').trim()
}

export default function PilihICD({ value, onChange, disabled = false }) {
  const [q, setQ] = useState('')
  const [hasil, setHasil] = useState([])
  const [buka, setBuka] = useState(false)
  const [memuat, setMemuat] = useState(false)
  const [galat, setGalat] = useState(null)
  const [aktifIdx, setAktifIdx] = useState(0)
  const wadah = useRef(null)

  // pencarian dengan jeda ketik 300 ms
  useEffect(() => {
    const kata = bersihkan(q)
    if (!buka) {
      setHasil([])
      setMemuat(false)
      return
    }
    setMemuat(true)
    let batal = false
    const t = setTimeout(async () => {
      let query = supabase.from('ref_icd10').select('kode, nama').eq('aktif', true)
      if (kata) query = query.or(`kode.ilike.${kata}%,nama.ilike.%${kata}%`)
      // Batas dinaikkan: daftar ICD kehamilan ±200 kode, jadi semuanya bisa di-scroll.
      // (sebelumnya 15 saat mengetik / 30 saat kosong sehingga kode lain terpotong)
      const { data, error } = await query.order('kode', { ascending: true }).limit(kata ? 100 : 500)
      if (batal) return
      setMemuat(false)
      if (error) {
        setGalat('Gagal mencari kode ICD: ' + error.message)
        setHasil([])
        return
      }
      setGalat(null)
      setHasil(data ?? [])
      setAktifIdx(0)
    }, 300)
    return () => {
      batal = true
      clearTimeout(t)
    }
  }, [q, buka])

  // tutup daftar saat klik di luar
  useEffect(() => {
    function luar(e) {
      if (wadah.current && !wadah.current.contains(e.target)) setBuka(false)
    }
    document.addEventListener('mousedown', luar)
    return () => document.removeEventListener('mousedown', luar)
  }, [])

  // daftar yang tampil = hasil pencarian + "Lainnya" di urutan paling akhir
  const daftar = !memuat && !galat ? [...hasil, ITEM_LAINNYA] : hasil

  function pilih(item) {
    onChange(item)
    setQ('')
    setHasil([])
    setBuka(false)
  }

  function tekan(e) {
    if (!buka || daftar.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setAktifIdx((i) => Math.min(i + 1, daftar.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setAktifIdx((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      pilih(daftar[aktifIdx])
    } else if (e.key === 'Escape') {
      setBuka(false)
    }
  }

  return (
    <div ref={wadah} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {value ? (
        <div
          style={{
            ...input,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            background: 'var(--accent-light, #dcf5f0)',
          }}
        >
          <span>
            <b>{value.kode}</b> — {value.nama}
          </span>
          {!disabled && (
            <button
              type="button"
              onClick={() => onChange(null)}
              style={{ border: 'none', background: 'none', color: 'var(--danger, #b42318)', cursor: 'pointer', fontSize: 12 }}
            >
              Ganti
            </button>
          )}
        </div>
      ) : (
        <div style={{ position: 'relative' }}>
          <input
            style={input}
            placeholder="Cari kode atau nama diagnosis (mis. Z34 atau anemia)"
            value={q}
            disabled={disabled}
            role="combobox"
            aria-expanded={buka}
            aria-autocomplete="list"
            onChange={(e) => {
              setQ(e.target.value)
              setBuka(true)
            }}
            onFocus={() => setBuka(true)}
            onKeyDown={tekan}
          />
          {buka && (
            <ul
              role="listbox"
              style={{
                position: 'absolute',
                zIndex: 20,
                left: 0,
                right: 0,
                top: '100%',
                margin: '4px 0 0',
                padding: 4,
                listStyle: 'none',
                maxHeight: 260,
                overflow: 'auto',
                background: '#fff',
                border: '1px solid var(--line, #e5e7eb)',
                borderRadius: 8,
                boxShadow: '0 6px 18px rgba(0,0,0,0.08)',
              }}
            >
              {memuat && <li style={{ padding: 8, fontSize: 12, color: 'var(--muted, #6b7280)' }}>Mencari…</li>}
              {!memuat && !galat && hasil.length === 0 && (
                <li style={{ padding: 8, fontSize: 12, color: 'var(--muted, #6b7280)' }}>
                  Tidak ada kode yang cocok. Pilih "Lainnya" di bawah untuk menulis diagnosis sendiri.
                </li>
              )}
              {galat && <li style={{ padding: 8, fontSize: 12, color: 'var(--danger, #b42318)' }}>{galat}</li>}
              {!memuat && !galat && hasil.length > 0 && (
                <li
                  style={{
                    padding: '4px 8px 6px',
                    fontSize: 11,
                    color: 'var(--muted, #6b7280)',
                    position: 'sticky',
                    top: -4,
                    background: '#fff',
                    zIndex: 1,
                  }}
                >
                  {hasil.length} kode ditemukan
                </li>
              )}
              {daftar.map((h, i) => (
                <li
                  key={h.kode}
                  role="option"
                  aria-selected={i === aktifIdx}
                  onMouseEnter={() => setAktifIdx(i)}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    pilih(h)
                  }}
                  style={{
                    padding: '7px 8px',
                    fontSize: 13,
                    borderRadius: 6,
                    cursor: 'pointer',
                    background: i === aktifIdx ? 'var(--accent-light, #dcf5f0)' : 'transparent',
                    borderTop: h.kode === KODE_LAINNYA ? '1px dashed var(--line, #e5e7eb)' : 'none',
                    marginTop: h.kode === KODE_LAINNYA ? 4 : 0,
                  }}
                >
                  <span style={{ display: 'inline-block', minWidth: 28, color: 'var(--muted, #6b7280)' }}>{i + 1}.</span>
                  <b>{h.kode}</b> — {h.nama}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}