// Admin client untuk server-side operations yang memerlukan bypass RLS
// Hanya gunakan di server-side, JANGAN expose service role key ke client

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseServiceRoleKey) {
  console.warn('SUPABASE_SERVICE_ROLE_KEY not set. Admin operations may fail.')
}

export const createAdminClient = () => {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error('Supabase admin credentials not configured')
  }

  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })
}
