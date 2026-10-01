/**
 * compressImageBeforeUpload.js
 *
 * Kompresi gambar di BROWSER (client-side) sebelum di-upload ke Supabase Storage.
 * Tidak butuh library eksternal — pakai Canvas API bawaan browser.
 * Karena proses ini jalan di device pengguna, tidak akan pernah kena limit
 * memory Edge Function (WORKER_RESOURCE_LIMIT) seperti sebelumnya.
 *
 * Cara pakai singkat:
 *   const compressedFile = await compressImage(originalFile);
 *   // lalu upload `compressedFile` seperti biasa ke Supabase Storage
 */

/**
 * Mengompres & meresize gambar menggunakan Canvas API.
 *
 * @param {File} file - File gambar asli dari <input type="file">
 * @param {Object} options
 * @param {number} options.maxWidthOrHeight - Sisi terpanjang maksimum dalam px (default 1600)
 * @param {number} options.quality - Kualitas JPEG 0-1 (default 0.7 = 70%)
 * @param {number} options.maxSizeMB - Jika hasil masih lebih besar dari ini, kompresi ulang dengan kualitas lebih rendah (default 2MB)
 * @returns {Promise<File>} File baru yang sudah dikompres, siap di-upload
 */
async function compressImage(file, options = {}) {
  const {
    maxWidthOrHeight = 1600,
    quality = 0.7,
    maxSizeMB = 2,
  } = options;

  // Kalau bukan gambar, jangan diproses — kembalikan file asli
  if (!file.type.startsWith('image/')) {
    return file;
  }

  // Kalau file sudah kecil, tidak perlu dikompres
  if (file.size <= maxSizeMB * 1024 * 1024) {
    return file;
  }

  const imageBitmap = await loadImageBitmap(file);

  // Hitung dimensi baru, jaga aspect ratio
  let { width, height } = imageBitmap;
  if (width > maxWidthOrHeight || height > maxWidthOrHeight) {
    if (width > height) {
      height = Math.round((height / width) * maxWidthOrHeight);
      width = maxWidthOrHeight;
    } else {
      width = Math.round((width / height) * maxWidthOrHeight);
      height = maxWidthOrHeight;
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(imageBitmap, 0, 0, width, height);

  // Coba kompresi, kalau masih terlalu besar, turunkan kualitas bertahap
  let currentQuality = quality;
  let blob = await canvasToBlob(canvas, currentQuality);

  while (blob.size > maxSizeMB * 1024 * 1024 && currentQuality > 0.3) {
    currentQuality -= 0.1;
    blob = await canvasToBlob(canvas, currentQuality);
  }

  // Buat nama file baru dengan ekstensi .jpg (karena hasil selalu JPEG)
  const originalName = file.name.replace(/\.[^/.]+$/, '');
  const newFileName = `${originalName}.jpg`;

  return new File([blob], newFileName, {
    type: 'image/jpeg',
    lastModified: Date.now(),
  });
}

/**
 * Helper: load File jadi ImageBitmap (lebih efisien memory daripada Image element)
 */
function loadImageBitmap(file) {
  if (window.createImageBitmap) {
    return createImageBitmap(file);
  }
  // Fallback untuk browser lama yang tidak support createImageBitmap
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

/**
 * Helper: convert canvas ke Blob JPEG dengan kualitas tertentu
 */
function canvasToBlob(canvas, quality) {
  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => resolve(blob),
      'image/jpeg',
      quality
    );
  });
}

// ============================================
// CONTOH PENGGUNAAN di fungsi upload Anda
// ============================================
//
// async function handleUploadFoto(file) {
//   try {
//     // 1. Kompres dulu di browser
//     const compressedFile = await compressImage(file, {
//       maxWidthOrHeight: 1600,
//       quality: 0.7,
//       maxSizeMB: 2,
//     });
//
//     console.log(
//       `Ukuran asli: ${(file.size / 1024 / 1024).toFixed(2)}MB → ` +
//       `Setelah kompres: ${(compressedFile.size / 1024 / 1024).toFixed(2)}MB`
//     );
//
//     // 2. Upload file yang SUDAH dikompres ke Supabase Storage (bukan file asli)
//     const filePath = `${userId}/${examId}/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
//     const { data, error } = await supabase.storage
//       .from('berkas-rm')
//       .upload(filePath, compressedFile);
//
//     if (error) throw error;
//     return data;
//   } catch (err) {
//     console.error('Gagal upload:', err);
//     throw err;
//   }
// }

export { compressImage };
