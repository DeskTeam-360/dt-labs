import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { getGlobalAnnouncementRow, resolveActiveAnnouncementMessage } from '@/lib/global-announcement'

/** GET — active banner for signed-in users (no sensitive config). */
export async function GET() {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ active: false, message: '' as string })
    }

    const row = await getGlobalAnnouncementRow()
    const text = resolveActiveAnnouncementMessage(row)
    return NextResponse.json({
      active: text != null,
      message: text ?? '',
    })
  } catch {
    return NextResponse.json({ active: false, message: '' as string })
  }
}
