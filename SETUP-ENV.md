# Setup Environment Variables

## Langkah-langkah Setup

### 1. Buat File `.env.local`

Buat file `.env.local` di root project (sama level dengan `package.json`).

### 2. Database (PostgreSQL)

Aplikasi memakai **PostgreSQL** lewat `DATABASE_URL` (Drizzle + driver `postgres`). Tidak ada client Supabase di runtime.

```env
# Wajib untuk koneksi DB (format connection string PostgreSQL)
DATABASE_URL=postgresql://user:password@host:5432/dbname

# Optional: site URL (OAuth callback, link email, dll.)
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Skrip SQL manual: lihat `drizzle/migrations/`.

### 3. Template `.env.local` (fitur opsional)

```env
DATABASE_URL=postgresql://user:password@localhost:5432/mydb
NEXT_PUBLIC_SITE_URL=http://localhost:3000

# --- OpenAI API (untuk embeddings / RAG / AI features) ---
# Dapatkan di https://platform.openai.com/api-keys
OPENAI_API_KEY=sk-your_openai_api_key_here
# OPENAI_EMBEDDING_MODEL=text-embedding-3-small
# OPENAI_CHAT_MODEL=gpt-4o-mini

# --- Freshdesk API (untuk testing integrasi) ---
# FRESHDESK_DOMAIN=mycompany
# FRESHDESK_API_KEY=your_freshdesk_api_key_here

# --- Google OAuth (untuk Email Integration / Shared Inbox) ---
# GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com
# GOOGLE_CLIENT_SECRET=your_google_client_secret
```

### 4. Restart Next.js Server

```bash
# Stop server (Ctrl+C), lalu:
npm run dev
```

## Troubleshooting

### Error koneksi database / `DATABASE_URL`

- Pastikan `DATABASE_URL` benar dan database bisa dijangkau dari mesin Anda.
- Setelah mengubah `.env.local`, restart `npm run dev`.

## Variabel yang sering dipakai

| Variabel | Keterangan |
|----------|------------|
| `DATABASE_URL` | Connection string PostgreSQL (wajib untuk fitur DB) |
| `NEXT_PUBLIC_SITE_URL` | Base URL aplikasi (opsional, untuk OAuth/link) |
| `OPENAI_API_KEY` | Fitur AI / embeddings / RAG (opsional) |

---

## OpenAI API (untuk Knowledge Base / Embeddings)

Agar fitur yang memakai OpenAI (misalnya embeddings untuk `company_knowledge_bases`) bisa jalan:

1. Buka **OpenAI Platform**: https://platform.openai.com/api-keys  
2. Login / daftar akun OpenAI.  
3. Klik **Create new secret key**, beri nama (mis. "My App"), copy key (format `sk-...`).  
4. Tambah di `.env.local`:
   ```env
   OPENAI_API_KEY=sk-your_key_here
   ```
5. **Jangan** pakai prefix `NEXT_PUBLIC_` — key ini hanya dipakai di server (API routes / server actions), jangan expose ke browser.

⚠️ **PENTING**:  
- Jangan commit `OPENAI_API_KEY` ke git.  
- Di production, set env ini di dashboard hosting (Vercel, dll.).  

---

## Freshdesk API (Testing)

Untuk menu **Freshdesk API Test** (testing integrasi Freshdesk):

1. **FRESHDESK_DOMAIN** – nama domain helpdesk tanpa `.freshdesk.com`. Contoh: jika URL helpdesk Anda `https://mycompany.freshdesk.com`, isi `mycompany`.
2. **FRESHDESK_API_KEY** – API key dari Freshdesk: Profile picture → Profile settings → API key (di bawah change password).

Tambahkan di `.env.local`:

```env
FRESHDESK_DOMAIN=mycompany
FRESHDESK_API_KEY=your_freshdesk_api_key_here
```

Key hanya dipakai di server (API route), tidak di-expose ke browser.

---

## Catatan

- File `.env.local` sudah ada di `.gitignore` (tidak akan ter-commit)
- Jangan share file `.env.local` ke orang lain
- Untuk production, set environment variables di hosting platform (Vercel, dll)
