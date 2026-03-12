import { auth } from '@/auth'
import { db, companyContentPlanners } from '@/lib/db'
import { and, eq } from 'drizzle-orm'
import { uploadBuffer } from '@/lib/storage-idrive'
import { NextResponse } from 'next/server'

const OPENAI_IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || 'dall-e-3'
const STORAGE_PREFIX = 'content-planner'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; plannerId: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: companyId, plannerId } = await params

    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { error: 'OPENAI_API_KEY is not configured' },
        { status: 503 }
      )
    }

    const body = await request.json().catch(() => ({}))
    const fromPrompt = typeof body?.image_prompt === 'string' ? body.image_prompt.trim() : ''
    const fromRec = typeof body?.image_recommendation === 'string' ? body.image_recommendation.trim() : ''
    let imagePrompt = fromPrompt || fromRec

    if (!imagePrompt) {
      const [planner] = await db.select({ aiContentResults: companyContentPlanners.aiContentResults })
        .from(companyContentPlanners)
        .where(and(
          eq(companyContentPlanners.id, plannerId),
          eq(companyContentPlanners.companyId, companyId)
        ))
        .limit(1)

      if (!planner?.aiContentResults) {
        return NextResponse.json({ error: 'Content planner not found' }, { status: 404 })
      }

      const results = planner.aiContentResults as Record<string, unknown>
      const outputJson = results?.output_json as Record<string, unknown> | undefined
      const imgPromptRaw = outputJson?.image_prompt ?? outputJson?.image_recommendation
      imagePrompt =
        typeof imgPromptRaw === 'string' ? imgPromptRaw.trim() : ''
    }

    if (!imagePrompt) {
      return NextResponse.json(
        { error: 'No image_prompt found. Generate content first or pass image_prompt in the request body.' },
        { status: 400 }
      )
    }

    const prefix = typeof body?.image_prompt_prefix === 'string' ? body.image_prompt_prefix.trim() : ''
    const finalPrompt = prefix ? `${prefix} ${imagePrompt}` : imagePrompt

    const imageRes = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: OPENAI_IMAGE_MODEL,
        prompt: finalPrompt,
        n: 1,
        size: '1024x1024',
        response_format: 'b64_json',
        quality: 'standard',
      }),
    })

    if (!imageRes.ok) {
      const err = await imageRes.json().catch(() => ({}))
      return NextResponse.json(
        { error: (err as any)?.error?.message || 'OpenAI image generation failed' },
        { status: imageRes.status }
      )
    }

    const imageJson = await imageRes.json()
    const b64 = imageJson?.data?.[0]?.b64_json
    if (!b64) {
      return NextResponse.json(
        { error: 'Invalid image response from OpenAI' },
        { status: 502 }
      )
    }

    const buffer = Buffer.from(b64, 'base64')
    const fileName = `${Date.now()}.png`
    const storagePath = `${STORAGE_PREFIX}/${companyId}/${plannerId}/${fileName}`

    const { url: publicUrl, error: uploadError } = await uploadBuffer(
      storagePath,
      buffer,
      'image/png'
    )

    if (uploadError || !publicUrl) {
      return NextResponse.json(
        { error: uploadError || 'Failed to upload image to storage' },
        { status: 500 }
      )
    }

    const [planner] = await db.select({ aiContentResults: companyContentPlanners.aiContentResults })
      .from(companyContentPlanners)
      .where(and(
        eq(companyContentPlanners.id, plannerId),
        eq(companyContentPlanners.companyId, companyId)
      ))
      .limit(1)

    const currentResults = ((planner?.aiContentResults || {}) as Record<string, unknown>)
    const updatedResults = {
      ...currentResults,
      generated_image_url: publicUrl,
      generated_image_path: storagePath,
    }

    await db.update(companyContentPlanners)
      .set({ aiContentResults: updatedResults })
      .where(and(
        eq(companyContentPlanners.id, plannerId),
        eq(companyContentPlanners.companyId, companyId)
      ))

    return NextResponse.json({
      url: publicUrl,
      path: storagePath,
      result: { generated_image_url: publicUrl },
    })
  } catch (error: unknown) {
    const err = error as { message?: string }
    return NextResponse.json(
      { error: err?.message || 'Failed to generate image' },
      { status: 500 }
    )
  }
}
