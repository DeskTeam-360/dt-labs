import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { getPublicUrl } from '@/lib/storage-provider'

/**
 * GET /api/attachments/download?url=<file url>&name=<file name>
 * Streams a stored attachment with `Content-Disposition: attachment` so the browser saves it
 * instead of opening it (the `download` attribute is ignored for cross-origin storage URLs).
 * Only files on our own storage origin are served.
 */
export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const reqUrl = new URL(request.url)
  const raw = reqUrl.searchParams.get('url')?.trim()
  if (!raw) return NextResponse.json({ error: 'url is required' }, { status: 400 })

  let target: URL
  let storageOrigin: string
  try {
    target = new URL(raw, reqUrl.origin)
    storageOrigin = new URL(getPublicUrl('probe'), reqUrl.origin).origin
  } catch {
    return NextResponse.json({ error: 'Invalid url' }, { status: 400 })
  }
  if (target.origin !== storageOrigin && target.origin !== reqUrl.origin) {
    return NextResponse.json({ error: 'Host not allowed' }, { status: 400 })
  }

  const upstream = await fetch(target.toString()).catch(() => null)
  if (!upstream?.ok || !upstream.body) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 })
  }

  const fallback = decodeURIComponent(target.pathname.split('/').pop() || 'download')
  const name = (reqUrl.searchParams.get('name')?.trim() || fallback).replace(/[\r\n"\/]/g, '_')
  const headers = new Headers({
    'Content-Type': upstream.headers.get('content-type') || 'application/octet-stream',
    'Content-Disposition': `attachment; filename="${name.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(name)}`,
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  })
  const len = upstream.headers.get('content-length')
  if (len) headers.set('Content-Length', len)
  return new Response(upstream.body, { headers })
}
