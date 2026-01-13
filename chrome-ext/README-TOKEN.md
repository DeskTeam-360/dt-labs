# Setup Token Authentication untuk Chrome Extension

## Cara Menggunakan Token Authentication

### 1. Login ke Aplikasi
- Login ke aplikasi Next.js Anda di browser
- Pastikan sudah login dengan akun yang valid

### 2. Generate API Token
1. Buka halaman **Profile** (menu di sidebar)
2. Scroll ke bagian **"API Tokens for Chrome Extension"**
3. Klik tombol **"Generate New Token"**
4. **PENTING**: Copy token yang muncul (token hanya ditampilkan sekali!)
5. Token akan expire setelah 30 hari

### 3. Konfigurasi Extension
1. Buka Chrome Extension popup
2. Masukkan:
   - **Next.js API URL**: URL aplikasi Anda (contoh: `http://localhost:3000` atau `https://your-app.vercel.app`)
   - **API Token**: Token yang sudah di-copy dari halaman Profile
3. Klik **"Simpan Konfigurasi"**
4. Extension siap digunakan!

## Keuntungan Token Authentication

✅ **Lebih Aman**: Tidak perlu service role key di extension  
✅ **User-Specific**: Setiap user punya token sendiri  
✅ **Trackable**: Bisa lihat siapa yang upload screenshot  
✅ **Revocable**: Bisa hapus token kapan saja  
✅ **Expirable**: Token otomatis expire setelah 30 hari  

## Troubleshooting

### "Token is required" error
- Pastikan token sudah di-copy dengan benar
- Pastikan tidak ada spasi di awal/akhir token
- Generate token baru jika perlu

### "Invalid or expired token" error
- Token mungkin sudah expired (30 hari)
- Token mungkin sudah dihapus
- Generate token baru di halaman Profile

### "Unauthorized" error
- Pastikan sudah login ke aplikasi
- Pastikan token masih aktif (cek di halaman Profile)

## Catatan

- Token hanya ditampilkan sekali saat generate
- Simpan token dengan aman (jangan share ke orang lain)
- Hapus token jika tidak digunakan lagi
- Token baru akan expire 30 hari setelah dibuat
