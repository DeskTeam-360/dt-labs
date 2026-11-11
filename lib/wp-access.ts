import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { isAdmin } from '@/lib/auth-utils'

/** Who may look at the WordPress monitoring: admin, operations and manager. Changing sites (register, key, delete) is admin only. */
export async function wpGate(opts: { adminOnly?: boolean } = {}): Promise<{ error: NextResponse } | { userId: string; role: string }> {
  const session = await auth()
  if (!session?.user?.id) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const role = ((session.user as { role?: string }).role ?? '').toLowerCase()
  const allowed = opts.adminOnly ? isAdmin(role) : ['admin', 'operations', 'manager'].includes(role)
  if (!allowed) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { userId: session.user.id, role }
}
