import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react'
import SignaturePad from 'signature_pad'

// Wrapper tipis di atas signature_pad (bukan react-signature-canvas).
//
// Kenapa tidak pakai react-signature-canvas: versi terbaru di npm
// (1.1.0-alpha.2) adalah build alpha yang gagal di-bundle Vite ("(0,
// import_build.default) is not a function"), dan versi stabil terakhirnya
// (1.0.6) hanya mendukung React sampai versi 18 — project ini pakai React 19.
// signature_pad sendiri (yang dipakai react-signature-canvas di baliknya)
// murni JS/canvas, tidak punya peerDependency ke React sama sekali, jadi
// tidak akan pernah bentrok versi React lagi.
//
// API yang diekspos lewat ref sengaja dibuat sama seperti
// react-signature-canvas supaya kode pemanggil (HalamanConsentPublik.jsx,
// ModalTtdPetugas, dll) tidak perlu berubah banyak:
//   ref.current.isEmpty()
//   ref.current.clear()
//   ref.current.getTrimmedCanvas() -> { toDataURL(mime) }
const SignatureCanvas = forwardRef(function SignatureCanvas(
  { penColor = 'black', canvasProps = {}, backgroundColor = 'rgba(0,0,0,0)' },
  ref
) {
  const canvasRef = useRef(null)
  const padRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    // Set resolusi canvas sesuai ukuran tampilnya (devicePixelRatio) supaya
    // tanda tangan tidak buram/pecah di HP dengan layar retina.
    function ukuranUlang() {
      const rasio = Math.max(window.devicePixelRatio || 1, 1)
      const { clientWidth, clientHeight } = canvas
      if (clientWidth === 0 || clientHeight === 0) return
      canvas.width = clientWidth * rasio
      canvas.height = clientHeight * rasio
      const ctx = canvas.getContext('2d')
      ctx.scale(rasio, rasio)
      padRef.current?.clear()
    }

    padRef.current = new SignaturePad(canvas, { penColor, backgroundColor })
    ukuranUlang()

    window.addEventListener('resize', ukuranUlang)
    return () => {
      window.removeEventListener('resize', ukuranUlang)
      padRef.current?.off()
      padRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (padRef.current) padRef.current.penColor = penColor
  }, [penColor])

  // Memangkas area transparan di sekeliling goresan tanda tangan, supaya
  // hasil PNG tidak penuh whitespace kosong (menggantikan trim-canvas yang
  // dipakai react-signature-canvas versi lama).
  function trimCanvas(canvas) {
    const ctx = canvas.getContext('2d')
    const { width, height } = canvas
    const data = ctx.getImageData(0, 0, width, height).data

    let top = null, bottom = null, left = null, right = null
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const alpha = data[(y * width + x) * 4 + 3]
        if (alpha !== 0) {
          if (top === null) top = y
          bottom = y
          if (left === null || x < left) left = x
          if (right === null || x > right) right = x
        }
      }
    }

    if (top === null) return canvas // canvas kosong, tidak ada yang dipangkas

    const trimmed = document.createElement('canvas')
    trimmed.width = right - left + 1
    trimmed.height = bottom - top + 1
    trimmed.getContext('2d').putImageData(
      ctx.getImageData(left, top, trimmed.width, trimmed.height),
      0,
      0
    )
    return trimmed
  }

  useImperativeHandle(ref, () => ({
    isEmpty: () => padRef.current?.isEmpty() ?? true,
    clear: () => padRef.current?.clear(),
    getTrimmedCanvas: () => {
      const trimmed = canvasRef.current ? trimCanvas(canvasRef.current) : null
      return {
        toDataURL: (mime = 'image/png') => trimmed?.toDataURL(mime) || '',
      }
    },
    toDataURL: (mime = 'image/png') => padRef.current?.toDataURL(mime) || '',
  }))

  const { className = '', style, ...restCanvasProps } = canvasProps

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ touchAction: 'none', ...style }}
      {...restCanvasProps}
    />
  )
})

export default SignatureCanvas
