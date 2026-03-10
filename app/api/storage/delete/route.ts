/**
 * Delete file from iDrive e2 storage.
 * POST body: { path: string } - path = object key (e.g. CompanyName/123/attachments/xxx.pdf)
 */
import { auth } from '@/auth'
import { deleteObject } from '@/lib/storage-idrive'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  let path = body?.path
  if (!path || typeof path !== 'string') {
    return NextResponse.json(
      { error: 'Missing path', success: false },
      { status: 400 }
    )
  }
  path = path.trim()
  if (!path) {
    return NextResponse.json(
      { error: 'Empty path', success: false },
      { status: 400 }
    )
  }
  // Hanya izinkan hapus file draft (CompanyName/draft/... atau draft/draft/...)
  if (!path.includes('/draft/')) {
    return NextResponse.json(
      { error: 'Hanya path draft yang boleh dihapus', success: false },
      { status: 403 }
    )
  }
  // Strip bucket prefix or full URL if accidentally passed
  const bucket = process.env.IDRIVE_E2_BUCKET || 'dtlabs'
  if (path.startsWith(`${bucket}/`)) path = path.slice(bucket.length + 1)
  if (path.startsWith('/')) path = path.slice(1)
  const publicUrl = process.env.IDRIVE_E2_PUBLIC_URL
  if (publicUrl && path.startsWith(publicUrl)) {
    path = path.slice(publicUrl.length).replace(/^\//, '')
  }

  const result = await deleteObject(path)
  if (result.ok) {
    return NextResponse.json({ success: true })
  }
  return NextResponse.json(
    { success: false, error: result.error || 'Delete failed' },
    { status: 500 }
  )
}
