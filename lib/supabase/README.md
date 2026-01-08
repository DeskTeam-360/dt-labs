# Supabase Configuration

Koneksi Supabase telah dikonfigurasi untuk proyek Next.js ini.

## Setup

1. Buat file `.env.local` di root proyek dengan konten berikut:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

2. Dapatkan nilai-nilai tersebut dari dashboard Supabase:
   - Buka https://app.supabase.com
   - Pilih project Anda
   - Pergi ke Settings > API
   - Salin `Project URL` dan `anon public` key

## Penggunaan

### Client-Side (Browser)

```typescript
import { createClient } from '@/lib/supabase/client'

export default function MyComponent() {
  const supabase = createClient()
  
  // Contoh: Fetch data
  const { data, error } = await supabase
    .from('your_table')
    .select('*')
  
  return <div>...</div>
}
```

### Server-Side (Server Components)

```typescript
import { createClient } from '@/lib/supabase/server'

export default async function MyServerComponent() {
  const supabase = await createClient()
  
  // Contoh: Fetch data
  const { data, error } = await supabase
    .from('your_table')
    .select('*')
  
  return <div>...</div>
}
```

### Server Actions

```typescript
'use server'

import { createClient } from '@/lib/supabase/server'

export async function myServerAction() {
  const supabase = await createClient()
  
  // Contoh: Insert data
  const { data, error } = await supabase
    .from('your_table')
    .insert({ ... })
  
  return { data, error }
}
```

## Middleware

Middleware telah dikonfigurasi untuk secara otomatis me-refresh session pengguna. File `middleware.ts` akan menangani autentikasi di semua route.

## Dokumentasi Lebih Lanjut

- [Supabase Documentation](https://supabase.com/docs)
- [Supabase JS Client](https://supabase.com/docs/reference/javascript/introduction)
- [Next.js with Supabase](https://supabase.com/docs/guides/getting-started/quickstarts/nextjs)

