# Cara Install Chrome Extension

## Langkah-langkah Instalasi

1. **Buka Chrome Extensions Page**
   - Buka browser Chrome
   - Ketik di address bar: `chrome://extensions/`
   - Atau klik menu (⋮) > More tools > Extensions

2. **Aktifkan Developer Mode**
   - Toggle switch "Developer mode" di pojok kanan atas
   - Pastikan switch berwarna biru/aktif

3. **Load Extension**
   - Klik tombol "Load unpacked"
   - Pilih folder `chrome-ext` dari project ini
   - Extension akan muncul di daftar extensions

4. **Pin Extension (Opsional)**
   - Klik icon puzzle (🧩) di toolbar Chrome
   - Cari "Screenshot & Upload"
   - Klik pin icon untuk pin extension ke toolbar

## Konfigurasi Pertama Kali

1. Klik icon extension di toolbar
2. Masukkan informasi Supabase:
   - **Supabase URL**: Dapatkan dari Supabase Dashboard > Settings > API > Project URL
   - **Supabase Anon Key**: Dapatkan dari Supabase Dashboard > Settings > API > anon/public key
   - **Access Token** (opsional): JWT token jika diperlukan autentikasi
3. Klik "Simpan Konfigurasi"
4. Extension siap digunakan!

## Cara Menggunakan

1. Buka halaman web yang ingin di-screenshot
2. Klik icon extension
3. Klik "📷 Ambil Screenshot"
4. Preview akan muncul
5. Klik "Upload" untuk mengupload ke Supabase
6. URL screenshot akan otomatis disalin ke clipboard

## Troubleshooting

### Extension tidak muncul
- Pastikan Developer mode aktif
- Refresh halaman extensions
- Cek console untuk error (klik "service worker" di card extension)

### Screenshot gagal
- Pastikan extension memiliki permission untuk tab aktif
- Coba reload extension

### Upload gagal
- Pastikan Supabase URL dan Key benar
- Pastikan bucket `dtlabs` sudah dibuat di Supabase Storage
- Cek policy storage di Supabase Dashboard
- Cek console untuk error detail

### Icon tidak muncul
- Buat icon 16x16, 48x48, dan 128x128 pixels
- Simpan sebagai PNG di folder `icons/`
- Reload extension

## Catatan

- Extension ini menggunakan Manifest V3
- Screenshot diambil dalam format PNG
- File diupload ke folder `screenshots/` di bucket `dtlabs`
- Konfigurasi disimpan di Chrome sync storage
