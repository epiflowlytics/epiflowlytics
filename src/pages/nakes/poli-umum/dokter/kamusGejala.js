// kamusGejala.js
// Kamus sinonim/variasi kata untuk gejala yang biasa ditulis dokter/perawat
// di keluhan_utama, catatan, anamnesis, atau diagnosis.
//
// STATUS KELENGKAPAN (baca ini dulu):
// Kamus ini DIPERLUAS dari versi sebelumnya dengan menambahkan istilah medis
// formal, bahasa sehari-hari umum, dan singkatan yang lazim di rekam medis
// Indonesia. TAPI ini tetap hasil pengetahuan umum, BUKAN hasil analisis data
// rekam medis asli dari faskes Anda. Istilah lokal/daerah (mis. bahasa Bugis,
// Makassar, Jawa, dst) yang mungkin dipakai di lapangan TIDAK otomatis
// tercakup kecuali ditambahkan manual. Kamus ini perlu direview dan ditambah
// terus oleh dokter/petugas surveilans yang memegang data nyata.
//
// CARA MAINTAIN FILE INI:
// - Setiap gejala punya satu "key" (nama konsep) dan daftar kata/frasa yang
//   mungkin dipakai untuk menyebutnya.
// - Key HARUS SAMA dengan yang dipakai di pd3iDetector.js pada ATURAN_PD3I.
//   Ubah/hapus key di sini -> cek juga pd3iDetector.js supaya tidak putus.
// - Tambah kata baru: cukup tambahkan string baru ke array yang sesuai.
// - Semua huruf otomatis dibandingkan huruf kecil (tidak perlu tulis kapital).
// - Kata kunci ASLI dari versi awal pd3iDetector.js SENGAJA jadi anggota
//   pertama tiap array — jangan dihapus, supaya cakupan lama tetap ada.

export const KAMUS_SINONIM = {
  // ══════════════════════════════════════════
  // DIARE & PENCERNAAN
  // ══════════════════════════════════════════
  diare: [
    'diare', 'mencret', 'bab cair', 'bab encer', 'buang air besar cair',
    'buang air besar encer', 'bab lembek', 'bab lembek cair', 'mencret-mencret',
    'diare akut', 'gastroenteritis', 'bab berkali-kali', 'bab lebih dari 3x',
    'bab >3x', 'sering bab', 'bab terus',
  ],
  'air cucian beras': [
    'air cucian beras', 'seperti air cucian beras', 'air beras',
    'bab seperti air cucian beras', 'feses seperti air cucian beras',
  ],
  'dehidrasi berat': [
    'dehidrasi berat', 'dehidrasi hebat', 'sangat lemas karena diare',
    'tanda dehidrasi berat', 'mata cekung', 'turgor kulit menurun',
    'bibir kering', 'kulit kering karena diare',
  ],
  'muntah hebat': [
    'muntah hebat', 'muntah terus menerus', 'muntah berat', 'muntah hebat sekali',
    'muntah-muntah', 'muntah tiap makan', 'muntah proyektil', 'muntah tidak berhenti',
  ],
  darah: ['darah', 'ada darah', 'terdapat darah'],
  berdarah: ['berdarah', 'bab berdarah', 'bab bercampur darah', 'bab ada darahnya'],
  berlendir: ['berlendir', 'bab berlendir', 'bab bercampur lendir'],
  lendir: ['lendir', 'ada lendir', 'terdapat lendir'],
  'sakit perut': [
    'sakit perut', 'nyeri perut', 'perut sakit', 'perut mulas', 'mules',
    'perut kram', 'kram perut', 'nyeri ulu hati', 'perut melilit',
  ],
  mual: ['mual', 'mual-mual', 'rasa ingin muntah', 'eneg'],
  kembung: ['kembung', 'perut kembung', 'begah'],

  // ══════════════════════════════════════════
  // DEMAM & GEJALA UMUM
  // ══════════════════════════════════════════
  demam: [
    'demam', 'panas badan', 'panas tinggi', 'febris', 'demam tinggi',
    'badan panas', 'meriang', 'panas', 'badan terasa panas', 'suhu tinggi',
    'suhu badan naik', 'demam ringan', 'sumeng', 'anget-anget', 'greges',
  ],
  menggigil: ['menggigil', 'kedinginan', 'gigil', 'badan gemetar kedinginan'],
  berkeringat: ['berkeringat', 'keringat dingin', 'banyak keringat', 'berkeringat malam hari'],
  malaria: ['malaria', 'plasmodium', 'demam malaria', 'demam trias malaria'],
  'lidah kotor': ['lidah kotor', 'lidah berlapis putih', 'lidah putih tebal', 'coated tongue'],
  tifoid: ['tifoid', 'tipes', 'typus', 'thypus'],
  typhoid: ['typhoid', 'thyphoid'],
  'demam naik turun': [
    'demam naik turun', 'demam hilang timbul', 'demam turun naik',
    'demam tidak menentu', 'demam intermiten',
  ],
  'demam lebih 7 hari': [
    'demam lebih 7 hari', 'demam lebih dari 7 hari', 'demam lebih seminggu',
    'demam sudah 1 minggu lebih', 'demam berkepanjangan',
  ],
  'demam seminggu': ['demam seminggu', 'demam 1 minggu', 'demam satu minggu', 'demam 7 hari'],
  lemas: ['lemas', 'badan lemas', 'lesu', 'letih', 'tidak bertenaga'],
  pusing: ['pusing', 'sakit kepala', 'kepala pusing', 'kepala sakit', 'cenat-cenut', 'nyeri kepala'],
  nafsu_makan_turun: ['nafsu makan turun', 'tidak nafsu makan', 'susah makan', 'anoreksia', 'malas makan'],

  // ══════════════════════════════════════════
  // NYERI SENDI/OTOT (Dengue, Chikungunya)
  // ══════════════════════════════════════════
  'nyeri sendi': [
    'nyeri sendi', 'sendi sakit', 'sakit sendi', 'sendi nyeri',
    'artralgia', 'sendi ngilu', 'sendi linu',
  ],
  'nyeri otot': [
    'nyeri otot', 'otot sakit', 'sakit otot', 'pegal-pegal', 'pegal linu',
    'mialgia', 'badan pegal', 'ngilu seluruh badan',
  ],
  'bintik merah': [
    'bintik merah', 'bintik-bintik merah', 'petekie', 'ptekie', 'bercak petekie',
  ],
  mimisan: ['mimisan', 'keluar darah dari hidung', 'perdarahan hidung', 'epistaksis'],
  'gusi berdarah': ['gusi berdarah', 'gusi mudah berdarah', 'perdarahan gusi'],
  trombosit: ['trombosit', 'trombosit turun', 'trombosit rendah', 'trombositopenia', 'plt rendah'],
  'nyeri sendi hebat': [
    'nyeri sendi hebat', 'sendi sangat nyeri', 'nyeri sendi berat',
    'nyeri sendi luar biasa', 'sendi terasa mau lepas',
  ],
  'sendi bengkak': ['sendi bengkak', 'bengkak sendi', 'sendi membengkak', 'sendi bengkak merah'],

  // ══════════════════════════════════════════
  // PERNAPASAN
  // ══════════════════════════════════════════
  batuk: [
    'batuk', 'batuk2', 'batuk-batuk', 'batuk berdahak', 'batuk kering',
    'batuk pilek', 'tussis', 'batuk grok-grok', 'batuk sejak',
  ],
  'sesak napas': [
    'sesak napas', 'sesak nafas', 'susah bernapas', 'napas berat',
    'sulit bernapas', 'dyspnea', 'sesak',
  ],
  'sesak nafas': ['sesak nafas', 'sesak napas', 'susah nafas', 'nafas sesak'],
  'napas cepat': [
    'napas cepat', 'nafas cepat', 'napas terengah-engah', 'tachypnea',
    'napas ngos-ngosan', 'frekuensi napas meningkat',
  ],
  'tarikan dinding dada': [
    'tarikan dinding dada', 'dada tertarik saat bernapas', 'retraksi dada',
    'retraksi', 'chest indrawing', 'dada cekung saat bernapas',
  ],
  pilek: [
    'pilek', 'flu ringan', 'hidung tersumbat', 'ingusan', 'meler',
    'hidung meler', 'rinore', 'coryza',
  ],
  'sakit tenggorokan': [
    'sakit tenggorokan', 'tenggorokan sakit', 'nyeri menelan', 'nyeri tenggorokan',
    'gatal tenggorokan', 'faringitis',
  ],
  'sesak berat': ['sesak berat', 'sesak sekali', 'sesak parah', 'sesak sangat berat'],
  dahak: ['dahak', 'berdahak', 'lendir dari batuk', 'sputum'],

  // ══════════════════════════════════════════
  // FLU BURUNG / COVID
  // ══════════════════════════════════════════
  'kontak unggas': ['kontak unggas', 'kontak dengan unggas', 'pelihara unggas', 'memelihara ayam'],
  'unggas mati': ['unggas mati', 'unggas mati mendadak', 'unggas banyak mati'],
  'ayam mati': ['ayam mati', 'ayam mati mendadak', 'ayam banyak mati'],
  'flu burung': ['flu burung', 'avian influenza', 'h5n1'],
  anosmia: ['anosmia', 'kehilangan indera penciuman'],
  'hilang penciuman': ['hilang penciuman', 'tidak bisa mencium bau', 'penciuman hilang', 'tidak bisa cium bau'],
  covid: ['covid', 'covid-19', 'corona', 'sars-cov-2'],
  'hasil tes positif': [
    'hasil tes positif', 'tes positif', 'swab positif', 'antigen positif',
    'pcr positif', 'rapid test positif',
  ],
  ageusia: ['ageusia', 'hilang indera perasa', 'lidah tidak bisa merasa'],

  // ══════════════════════════════════════════
  // CAMPAK / HFMD
  // ══════════════════════════════════════════
  ruam: ['ruam', 'ruam kulit', 'kemerahan kulit', 'rash', 'bintik kemerahan di kulit'],
  'bercak merah': ['bercak merah', 'bercak kemerahan', 'bercak merah di kulit'],
  campak: ['campak', 'measles', 'tampek', 'gabagen', 'morbili'],
  'mata merah': ['mata merah', 'konjungtiva merah', 'mata merah berair'],
  konjungtivitis: ['konjungtivitis', 'radang mata'],
  'luka mulut': ['luka mulut', 'luka di mulut', 'sariawan mulut', 'luka rongga mulut'],
  sariawan: ['sariawan', 'stomatitis'],
  'bintik tangan': ['bintik tangan', 'bintik di tangan', 'bintik di telapak tangan'],
  'bintik kaki': ['bintik kaki', 'bintik di kaki', 'bintik di telapak kaki'],
  hfmd: ['hfmd', 'hand foot mouth disease'],
  'flu singapura': ['flu singapura'],

  // ══════════════════════════════════════════
  // DIFTERI
  // ══════════════════════════════════════════
  'selaput putih': [
    'selaput putih', 'lapisan putih di tenggorokan', 'membran putih tenggorokan',
    'bercak putih tenggorokan', 'plak putih tenggorokan',
  ],
  pseudomembran: ['pseudomembran', 'pseudo membran'],
  sesak: ['sesak', 'sesak napas ringan', 'agak sesak'],
  'suara serak': ['suara serak', 'suara parau', 'serak', 'suara hilang'],
  'leher bengkak': ['leher bengkak', 'bull neck', 'bengkak leher', 'kelenjar leher bengkak'],

  // ══════════════════════════════════════════
  // PERTUSIS
  // ══════════════════════════════════════════
  'batuk rejan': ['batuk rejan', 'batuk 100 hari', 'batuk rejan whooping'],
  whooping: ['whooping', 'whooping cough', 'bunyi whoop saat batuk'],
  '2 minggu': ['2 minggu', 'dua minggu'],
  'dua minggu': ['dua minggu', '2 minggu'],
  'batuk lama': ['batuk lama', 'batuk tak kunjung sembuh', 'batuk kronis', 'batuk sudah lama'],
  'batuk berkepanjangan': ['batuk berkepanjangan', 'batuk terus menerus lama', 'batuk tidak sembuh-sembuh'],
  'batuk sampai muntah': ['batuk sampai muntah', 'batuk hebat sampai muntah'],

  // ══════════════════════════════════════════
  // AFP (LUMPUH LAYU)
  // ══════════════════════════════════════════
  lumpuh: ['lumpuh', 'kelumpuhan', 'paralisis'],
  'lumpuh layu': ['lumpuh layu', 'kelumpuhan layu', 'lumpuh layu akut', 'flaccid paralysis'],
  'lemas mendadak': [
    'lemas mendadak', 'tiba-tiba lemas', 'mendadak lemas', 'lemas tiba-tiba',
    'kelemahan mendadak', 'lemah mendadak',
  ],
  'tidak bisa berjalan': [
    'tidak bisa berjalan', 'tidak bisa jalan', 'sulit berjalan', 'tidak kuat berjalan',
    'jalan pincang mendadak', 'tidak mampu berdiri',
  ],
  'kelemahan anggota gerak': [
    'kelemahan anggota gerak', 'lemah anggota gerak', 'tangan kaki lemah',
    'kaki lemah', 'tangan lemah', 'anggota gerak lumpuh',
  ],
  'afp': ['afp', 'acute flaccid paralysis', 'lumpuh layu akut', 'lumpuh mendadak pada anak'],

  // ══════════════════════════════════════════
  // RABIES
  // ══════════════════════════════════════════
  'gigitan anjing': ['gigitan anjing', 'digigit anjing', 'luka gigitan anjing'],
  'gigitan kucing': ['gigitan kucing', 'digigit kucing', 'luka gigitan kucing'],
  'gigitan kera': ['gigitan kera', 'digigit kera', 'luka gigitan kera'],
  'gigitan monyet': ['gigitan monyet', 'digigit monyet', 'luka gigitan monyet'],
  'digigit anjing': ['digigit anjing', 'gigitan anjing'],
  'digigit kucing': ['digigit kucing', 'gigitan kucing'],
  'digigit kera': ['digigit kera', 'gigitan kera'],
  rabies: ['rabies', 'anjing gila', 'hewan penular rabies', 'hpr'],
  'takut air': ['takut air', 'hidrofobia', 'phobia air'],

  // ══════════════════════════════════════════
  // ANTRAKS
  // ══════════════════════════════════════════
  'luka hitam': ['luka hitam', 'koreng hitam di kulit', 'lesi hitam di kulit'],
  'koreng hitam': ['koreng hitam', 'luka hitam berkoreng', 'keropeng hitam'],
  'kontak hewan ternak': [
    'kontak hewan ternak', 'kontak dengan ternak', 'kontak sapi', 'kontak kambing',
    'kontak kerbau', 'memotong hewan ternak', 'menyembelih ternak sakit',
  ],
  antraks: ['antraks', 'anthrax'],
  antrax: ['antrax', 'antraks'],
  'ternak sakit': ['ternak sakit', 'sapi sakit', 'kambing sakit', 'kerbau sakit'],
  'ternak mati': ['ternak mati', 'sapi mati mendadak', 'kambing mati mendadak', 'kerbau mati mendadak'],

  // ══════════════════════════════════════════
  // LEPTOSPIROSIS
  // ══════════════════════════════════════════
  banjir: ['banjir', 'riwayat banjir', 'daerah banjir', 'terendam banjir'],
  'air kotor': ['air kotor', 'kontak air kotor', 'genangan air kotor', 'air comberan'],
  tikus: ['tikus', 'kontak tikus', 'gigitan tikus', 'air kencing tikus'],
  leptospirosis: ['leptospirosis', 'lepto'],
  'nyeri betis': ['nyeri betis', 'betis sakit', 'sakit betis', 'nyeri otot betis'],
  'mata kuning leptospirosis': ['mata kuning', 'sklera ikterik'],

  // ══════════════════════════════════════════
  // MENINGITIS/ENCEPHALITIS
  // ══════════════════════════════════════════
  'kaku kuduk': ['kaku kuduk', 'leher kaku', 'tengkuk kaku', 'kaku leher'],
  'penurunan kesadaran': [
    'penurunan kesadaran', 'kesadaran menurun', 'sulit dibangunkan',
    'kesadaran menurun drastis', 'somnolen', 'sopor', 'koma',
  ],
  'kejang demam': ['kejang demam', 'kejang saat demam'],
  'sakit kepala hebat': [
    'sakit kepala hebat', 'nyeri kepala hebat', 'sakit kepala berat',
    'sakit kepala luar biasa', 'sakit kepala tidak tertahankan',
  ],
  meningitis: ['meningitis', 'radang selaput otak'],
  encephalitis: ['encephalitis', 'ensefalitis', 'radang otak'],
  fotofobia: ['fotofobia', 'silau melihat cahaya', 'tidak tahan cahaya'],

  // ══════════════════════════════════════════
  // TETANUS
  // ══════════════════════════════════════════
  kejang: ['kejang', 'kejang-kejang', 'step'],
  bayi: ['bayi', 'neonatal', 'usia bayi'],
  'baru lahir': ['baru lahir', 'baru saja lahir', 'neonatal'],
  neonatus: ['neonatus', 'bayi baru lahir'],
  'tidak bisa menyusu': [
    'tidak bisa menyusu', 'susah menyusu', 'sulit menyusu', 'bayi tidak mau menyusu',
    'bayi menolak asi', 'gagal menyusu',
  ],
  'mulut mencucu': ['mulut mencucu', 'mulut seperti mencucu', 'mulut ikan', 'trismus pada bayi'],
  'kaku rahang': ['kaku rahang', 'rahang kaku', 'susah membuka mulut', 'rahang terkunci'],
  'mulut terkunci': ['mulut terkunci', 'mulut tidak bisa dibuka', 'lockjaw'],
  'kaku otot': ['kaku otot', 'otot kaku', 'kekakuan otot', 'kekakuan seluruh tubuh'],
  'luka kotor': [
    'luka kotor', 'luka tidak dirawat', 'luka terinfeksi kotor',
    'luka tertusuk paku', 'luka tertusuk benda kotor', 'luka bernanah',
  ],
  trismus: ['trismus'],
  'punggung melengkung': ['punggung melengkung', 'opistotonus', 'badan melengkung saat kejang'],

  // ══════════════════════════════════════════
  // JAUNDICE (SINDROM KUNING)
  // ══════════════════════════════════════════
  kuning: ['kuning', 'menguning'],
  jaundice: ['jaundice', 'ikterik', 'ikterus'],
  'mata kuning': ['mata kuning', 'sklera kuning', 'sklera ikterik', 'putih mata kuning'],
  'kulit kuning': ['kulit kuning', 'badan kuning', 'kulit menguning'],
  'kencing seperti teh': [
    'kencing seperti teh', 'air kencing seperti teh', 'kencing warna teh',
    'urine gelap', 'kencing gelap', 'kencing coklat pekat',
  ],
  'feses pucat': ['feses pucat', 'bab pucat', 'bab warna dempul'],
}

// Kata/frasa negasi umum dalam catatan medis Bahasa Indonesia.
// Dicek di KEDUA arah (sebelum & sesudah kata kunci) oleh pd3iDetector.js,
// karena pola rekam medis sering menaruh negasi setelah gejala
// (mis. "demam disangkal") maupun sebelum gejala (mis. "tidak demam").
export const KATA_NEGASI = [
  'tidak ada',
  'tidak',
  'tanpa',
  'disangkal',
  'negatif',
  'bukan',
  'belum ada',
  'tidak dijumpai',
  'tidak ditemukan',
  'tidak tampak',
  'tidak terdapat',
  'sudah tidak',
]