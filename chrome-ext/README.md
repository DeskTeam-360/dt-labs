# Chrome Extension - Screenshot & Upload

Extension Chrome untuk mengambil screenshot dan mengupload melalui Next.js API.

## Fitur

- 📸 Ambil screenshot dari tab aktif
- ☁️ Upload screenshot melalui Next.js API endpoint
- 🔄 Fleksibel - mudah ganti backend tanpa ubah extension
- 📋 URL screenshot otomatis disalin ke clipboard setelah upload

## Instalasi

1. Buka Chrome dan navigasi ke `chrome://extensions/`
2. Aktifkan "Developer mode" (toggle di pojok kanan atas)
3. Klik "Load unpacked"
4. Pilih folder `chrome-ext` dari project ini
5. Extension akan terinstall dan icon akan muncul di toolbar

## Konfigurasi

1. Pastikan Next.js API sudah running (development: `npm run dev` atau production)
2. Klik icon extension di toolbar Chrome
3. Masukkan **Next.js API URL**:
   - Development: `http://localhost:3000`
   - Production: `https://your-app.vercel.app` (atau domain Anda)
4. Klik "Simpan Konfigurasi"
5. Konfigurasi akan tersimpan dan extension siap digunakan

## Penggunaan

1. Buka halaman web yang ingin di-screenshot
2. Klik icon extension
3. Klik tombol "📷 Ambil Screenshot"
4. Preview screenshot akan muncul
5. Klik "Upload" untuk mengupload ke Supabase
6. URL screenshot akan otomatis disalin ke clipboard

## Struktur File

```
chrome-ext/
├── manifest.json          # Manifest file untuk extension
├── background.js          # Service worker untuk capture screenshot
├── popup.html             # UI popup extension
├── popup.css              # Styling popup
├── popup.js               # Logic popup
├── supabase-client.js     # API client untuk extension (call Next.js API)
├── icons/                 # Icon extension (16x16, 48x48, 128x128)
└── README.md              # Dokumentasi ini
```

## API Endpoint

Extension menggunakan endpoint Next.js: `POST /api/screenshots`

Endpoint ini akan:
1. Menerima file screenshot (FormData)
2. Validasi file (type, size)
3. Upload ke Supabase Storage (bucket: `dtlabs`, folder: `screenshots/`)
4. Return public URL screenshot

## Persyaratan Backend

1. Pastikan Next.js API route `/api/screenshots` sudah tersedia
2. Pastikan bucket `dtlabs` sudah dibuat di Supabase Storage
3. Pastikan policy untuk upload sudah dikonfigurasi dengan benar
4. Screenshot akan diupload ke path: `screenshots/screenshot-{timestamp}.png`

## Troubleshooting

- **Error upload**: 
  - Pastikan Next.js API URL benar dan server running
  - Pastikan endpoint `/api/screenshots` tersedia
  - Cek console browser untuk error detail
- **Screenshot tidak muncul**: Pastikan extension memiliki permission untuk tab aktif
- **Clipboard tidak bekerja**: Beberapa browser memerlukan HTTPS untuk clipboard API
- **CORS error**: Pastikan Next.js API mengizinkan request dari extension

## Keuntungan Arsitektur Ini

✅ **Fleksibel**: Mudah ganti backend (Supabase, AWS S3, dll) tanpa ubah extension  
✅ **Aman**: Tidak expose Supabase key di extension  
✅ **Terpusat**: Validasi, logging, dan business logic di satu tempat  
✅ **Mudah maintenance**: Update backend logic tanpa perlu update extension

## Catatan

- Extension ini menggunakan Manifest V3
- Screenshot diambil dalam format PNG
- File diupload melalui Next.js API ke folder `screenshots/` di bucket `dtlabs`
