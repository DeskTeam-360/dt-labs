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

# --- OpenAI API (untuk embeddings / RAG / AI features) ---
# Dapatkan di https://platform.openai.com/api-keys
OPENAI_API_KEY=sk-your_openai_api_key_here
# Optional: model untuk embeddings (default: text-embedding-3-small)
# OPENAI_EMBEDDING_MODEL=text-embedding-3-small
# Optional: model untuk generate konten dari knowledge base / RAG (default: gpt-4o-mini)
# OPENAI_CHAT_MODEL=gpt-4o-mini

# --- Freshdesk API (untuk testing integrasi) ---
# Domain helpdesk (tanpa .freshdesk.com). Contoh: mycompany -> https://mycompany.freshdesk.com
# FRESHDESK_DOMAIN=mycompany
# API key dari Profile Settings di Freshdesk portal
# FRESHDESK_API_KEY=your_freshdesk_api_key_here
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
✅ `OPENAI_API_KEY` - OpenAI API key (untuk embeddings, RAG, knowledge base)  

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
