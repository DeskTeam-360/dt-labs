# Setup Screenshots Upload

## 1. Tambahkan Service Role Key ke Environment Variables

Tambahkan ke file `.env.local`:

```env
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```

**Cara mendapatkan Service Role Key:**
1. Buka Supabase Dashboard
2. Pilih project Anda
3. Pergi ke Settings > API
4. Salin **`service_role` key** (bukan anon key!)
5. ⚠️ **PENTING**: Jangan expose key ini ke client-side!

## 2. Jalankan Storage Policy untuk Screenshots

Jalankan SQL berikut di Supabase SQL Editor:

```sql
-- File: supabase/add-screenshots-storage-policy.sql
```

Atau copy-paste dari file tersebut.

## 3. Pastikan Bucket 'dtlabs' Sudah Dibuat

1. Buka Supabase Dashboard > Storage
2. Pastikan bucket `dtlabs` sudah ada
3. Jika belum, buat bucket baru dengan nama `dtlabs`

## 4. Test Upload

Setelah setup selesai, test upload melalui:
- Chrome Extension
- Atau langsung test API: `POST /api/screenshots`

## Troubleshooting

### Error: "SUPABASE_SERVICE_ROLE_KEY not set"
- Pastikan sudah menambahkan key ke `.env.local`
- Restart Next.js dev server setelah menambah env variable

### Error: "new row violates row-level security policy"
- Pastikan sudah menjalankan SQL policy untuk screenshots folder
- Cek apakah bucket `dtlabs` sudah dibuat

### Error: "Unauthorized"
- Jika menggunakan admin client, error ini seharusnya tidak muncul
- Pastikan service role key benar

## Security Notes

⚠️ **PENTING**: 
- Service Role Key memiliki akses penuh ke database
- JANGAN expose key ini ke client-side
- Hanya gunakan di server-side (API routes, server actions)
- Jangan commit `.env.local` ke git
