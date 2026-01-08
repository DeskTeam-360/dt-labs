# Supabase Configuration

Koneksi Supabase telah dikonfigurasi untuk proyek Next.js ini.

## Setup

1. Buat file `.env.local` di root proyek dengan konten berikut:

```env
NEXT_PUBLIC_SUPABASE_URL=https://squkqmnwfkdxeygzklop.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=sb_publishable_srMy7g_b-7bFzt2n7L6amQ_XeoHif5y
```

2. Atau dapatkan nilai-nilai tersebut dari dashboard Supabase:
   - Buka https://app.supabase.com
   - Pilih project Anda
   - Pergi ke Settings > API
   - Salin `Project URL` dan `publishable default key`

## Penggunaan

### Client-Side (Browser)

```typescript
'use client'

import { createClient } from '@/utils/supabase/client'

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
import { createClient } from '@/utils/supabase/server'
import { cookies } from 'next/headers'

export default async function MyServerComponent() {
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)
  
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

import { createClient } from '@/utils/supabase/server'
import { cookies } from 'next/headers'

export async function myServerAction() {
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)
  
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

