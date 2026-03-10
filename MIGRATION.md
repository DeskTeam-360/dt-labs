# Migrasi: Supabase → PostgreSQL + NextAuth + iDrive e2

## Ringkasan

Proyek ini bermigrasi dari:
- **DB**: Supabase (PostgreSQL managed) → PostgreSQL standalone
- **AUTH**: Supabase Auth → NextAuth.js + Credentials (users di PostgreSQL)
- **FILE**: Supabase Storage → iDrive e2 (S3-compatible)

## Yang Sudah Dilakukan

### 1. Database (Drizzle + PostgreSQL)
- ✅ Schema Drizzle di `lib/db/schema.ts` (dari Supabase migrations)
- ✅ Tabel `users` punya kolom `password_hash` (untuk auth)
- ✅ `lib/db.ts` & `lib/db/` - Drizzle client + schema

**Langkah setup:**
```bash
# Set DATABASE_URL di .env
cp .env.example .env
# Edit .env: DATABASE_URL="postgresql://user:pass@host:5432/dbname"

# Push schema ke DB
npm run db:push
```

**Migrasi data dari Supabase:** Export data dari Supabase, tambah kolom `password_hash` di users (hash password dengan bcrypt), import ke PostgreSQL baru.

### 2. Auth (NextAuth.js)
- ✅ `auth.ts` - NextAuth config dengan Credentials provider
- ✅ `app/api/auth/[...nextauth]/route.ts` - API route
- ✅ Middleware migrasi dari Supabase ke NextAuth
- ✅ Login page menggunakan `signIn('credentials', ...)`
- ✅ SessionProvider di layout

**Env:** `AUTH_SECRET` (generate: `npx auth secret`)

**User baru:** Harus punya `password_hash` di tabel users. Untuk register, buat API/script yang hash password dengan bcrypt sebelum insert.

### 3. Storage (iDrive e2)
- ✅ `lib/storage-idrive.ts` - S3 client untuk iDrive e2
- ✅ `utils/storage.ts` - API sama, backend iDrive e2
- ✅ Client upload via `/api/upload`
- ✅ Client delete via `/api/storage/delete`

**Env:**
- `IDRIVE_E2_ENDPOINT`
- `IDRIVE_E2_ACCESS_KEY`
- `IDRIVE_E2_SECRET_KEY`
- `IDRIVE_E2_BUCKET`

## Status Komponen

**Sudah di-migrate:**
- Dashboard page (`app/(auth)/dashboard/page.tsx`, `app/auth/dashboard/page.tsx`) - auth() + prisma
- AdminSidebar - signOut dari next-auth
- Login page - signIn credentials
- Generate image API - auth() + prisma + iDrive storage
- `/api/upload`, `/api/storage/delete` - upload/delete ke iDrive e2

**Masih pakai Supabase (perlu migrasi bertahap):**
- `DashboardContent` - fetch todo_time_tracker, dll (perlu API routes + Prisma)
- `ScreenshotsContent` - supabase.storage + supabase.from
- Semua API routes lain (companies, crawl, email, screenshots, dll)
- Semua components yang fetch data

## Yang Perlu Dilakukan (Sisa)

### 4. Migrasi API Routes & Components
**Pola migrasi:**
- Ganti `createClient() from '@/utils/supabase/server'` → `auth()` + `db` (Drizzle)
- Ganti `supabase.auth.getUser()` → `auth()` / `getCurrentUser()`
- Ganti `supabase.from('tabel')` → `db.select().from(tabel)` / `db.insert(tabel)` / dll

**File yang perlu diubah (contoh):**
- `app/(auth)/dashboard/page.tsx` - gunakan auth() + prisma
- `app/auth/dashboard/page.tsx` - sama
- `components/AdminSidebar.tsx` - signOut dari next-auth
- `components/DashboardContent.tsx` - type User → SessionUser
- Semua API routes di `app/api/` - ganti supabase dengan prisma
- Semua components yang fetch data - ganti supabase client dengan fetch ke API atau server component + prisma

### 5. Screenshots & Storage di Components
- `components/ScreenshotsContent.tsx` - ganti `supabase.storage.from('dtlabs')` dengan:
  - Upload: `fetch('/api/upload', { method: 'POST', body: formData })`
  - Delete: `fetch('/api/storage/delete', { method: 'POST', body: JSON.stringify({ path }) })`
- Atau gunakan `utils/storage.ts` yang sudah di-migrate

### 6. Realtime (Supabase Realtime)
Supabase Realtime tidak tersedia di PostgreSQL standalone. Opsi:
- Gunakan Pusher, Ably, atau WebSocket server sendiri
- Atau polling untuk fitur yang butuh real-time

### 7. RPC (mark_ticket_read, search_company_knowledge_bases)
- `mark_ticket_read` - buat fungsi Prisma/raw SQL
- `search_company_knowledge_bases` - jika pakai embedding/pgvector, perlu extension atau raw query

## Checklist Migrasi

- [ ] Setup .env (DATABASE_URL, AUTH_SECRET, IDRIVE_E2_*)
- [ ] `npx prisma db push` atau migrate
- [ ] Migrasi data users + password_hash
- [ ] Create bucket di iDrive e2, migrasi file dari Supabase Storage
- [ ] Update semua API routes (Supabase → Prisma)
- [ ] Update semua components (auth, data fetch, storage)
- [ ] Hapus dependency @supabase/ssr, @supabase/supabase-js
- [ ] Hapus utils/supabase/*
- [ ] Test end-to-end
