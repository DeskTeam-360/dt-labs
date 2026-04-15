/**
 * Upload file to iDrive e2 storage (migrasi dari Supabase Storage).
 * Client components dapat POST FormData dengan 'file' dan 'path'.
 */
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { getPublicUrl,uploadBuffer } from '@/lib/storage-idrive'

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  const path = formData.get('path') as string | null

  if (!file || !path) {
    return NextResponse.json(
      { error: 'Missing file or path' },
      { status: 400 }
    )
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const contentType = file.type || 'application/octet-stream'

  const result = await uploadBuffer(path, buffer, contentType)
  if (result.error) {
    return NextResponse.json(
      { error: result.error },
      { status: 500 }
    )
  }

  return NextResponse.json({
    url: result.url,
    path,
  })
}
