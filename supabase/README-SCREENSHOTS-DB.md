# Setup Screenshots Database & Gallery

## 1. Jalankan Migration

Jalankan SQL berikut di Supabase SQL Editor:

```sql
-- File: supabase/migrations/create_screenshots_table.sql
```

Migration ini akan membuat:
- Tabel `screenshots` untuk menyimpan metadata
- Relasi dengan tabel `todos` (todo_id)
- RLS policies untuk keamanan
- Indexes untuk performa

## 2. Fitur yang Tersedia

### Database Integration
- ✅ Metadata screenshot disimpan di database
- ✅ Relasi dengan todos (bisa link screenshot ke todo)
- ✅ Filter berdasarkan todo
- ✅ Filter berdasarkan tanggal
- ✅ Search dan sort

### Website Gallery
- ✅ Halaman `/screenshots` di website utama
- ✅ Grid layout dengan thumbnail
- ✅ Filter by todo dan date range
- ✅ Link screenshot ke todo
- ✅ Delete screenshot
- ✅ Copy URL

### Todo Integration
- ✅ Tab "Screenshots" di halaman todo detail
- ✅ Menampilkan screenshots yang terkait dengan todo
- ✅ Auto-link berdasarkan waktu (bisa dikembangkan)

## 3. API Endpoints

### POST /api/screenshots
Upload screenshot dan simpan metadata ke database

### GET /api/screenshots
List screenshots dengan filter:
- `limit`: jumlah data (default: 50)
- `offset`: pagination offset (default: 0)
- `todo_id`: filter by todo

### PATCH /api/screenshots/[id]
Update screenshot (link to todo, title, description)

### DELETE /api/screenshots/[id]
Delete screenshot (dari database dan storage)

## 4. Integrasi dengan Todo

Screenshot bisa di-link ke todo dengan cara:
1. Di halaman Screenshots Gallery: pilih todo dari dropdown
2. Di halaman Todo Detail: screenshots yang sudah di-link akan muncul di tab Screenshots

## 5. Auto-link Berdasarkan Waktu (Future Enhancement)

Untuk auto-link screenshot ke todo berdasarkan waktu, bisa ditambahkan logic:
- Saat upload screenshot, cek todo yang sedang aktif (time tracker running)
- Auto-link screenshot ke todo tersebut
- Atau link ke todo terakhir yang di-update oleh user

## Catatan

- Screenshot metadata disimpan di database, file tetap di storage
- RLS policies memastikan user hanya bisa akses screenshot mereka sendiri
- Relasi dengan todos memungkinkan tracking screenshot per project/todo
