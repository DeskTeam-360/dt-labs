import { addApiNote } from '@/lib/api-comments'

export const dynamic = 'force-dynamic'

/** POST /api/v1/tickets/{id}/notes - an internal note, marked "via API". See lib/api-comments.ts. Scope: `notes:write`. */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return addApiNote(request, (await ctx.params).id)
}
