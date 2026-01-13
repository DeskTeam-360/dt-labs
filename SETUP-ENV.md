# Setup Environment Variables

## Langkah-langkah Setup

### 1. Buat File `.env.local`

Buat file `.env.local` di root project (sama level dengan `package.json`).

### 2. Dapatkan Credentials dari Supabase

1. Buka **Supabase Dashboard**: https://app.supabase.com
2. Pilih **project Anda**
3. Pergi ke **Settings > API**
4. Salin nilai-nilai berikut:

### 3. Isi File `.env.local`

Copy template berikut dan isi dengan nilai dari Supabase:

```env
# Supabase Project URL
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co

# Supabase Anon/Public Key
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=your_publishable_key_here

# Supabase Service Role Key (PENTING untuk upload screenshot!)
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here

# Optional: Site URL
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

### 4. Cara Mendapatkan Service Role Key

1. Di Supabase Dashboard > Settings > API
2. Scroll ke bagian **"Project API keys"**
3. Cari **"service_role"** key (bukan "anon" atau "publishable")
4. Klik **"Reveal"** untuk melihat key
5. Copy key tersebut ke `.env.local`

⚠️ **PENTING**: 
- Service Role Key memiliki akses penuh ke database
- JANGAN commit file `.env.local` ke git
- JANGAN expose key ini ke client-side

### 5. Restart Next.js Server

Setelah menambahkan environment variables:

```bash
# Stop server (Ctrl+C)
# Start lagi
npm run dev
```

## Troubleshooting

### Error: "Supabase admin credentials not configured"
- Pastikan `SUPABASE_SERVICE_ROLE_KEY` sudah ditambahkan ke `.env.local`
- Pastikan tidak ada typo di nama variable
- Restart Next.js dev server setelah menambah env variable

### Error: "NEXT_PUBLIC_SUPABASE_URL is not defined"
- Pastikan semua environment variables sudah diisi
- Pastikan file `.env.local` ada di root project
- Restart Next.js dev server

## File yang Perlu Diisi

✅ `NEXT_PUBLIC_SUPABASE_URL` - Project URL  
✅ `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY` - Anon/Public key  
✅ `SUPABASE_SERVICE_ROLE_KEY` - Service role key (untuk admin operations)  

## Catatan

- File `.env.local` sudah ada di `.gitignore` (tidak akan ter-commit)
- Jangan share file `.env.local` ke orang lain
- Untuk production, set environment variables di hosting platform (Vercel, dll)
