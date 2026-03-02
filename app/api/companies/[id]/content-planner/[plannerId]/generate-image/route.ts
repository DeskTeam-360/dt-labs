import { createClient } from '@/utils/supabase/server'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

const OPENAI_IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || 'dall-e-3'
const STORAGE_BUCKET = 'dtlabs'
const STORAGE_PREFIX = 'content-planner'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; plannerId: string }> }
) {
  try {
    const cookieStore = await cookies()
    const supabase = createClient(cookieStore)
    const { id: companyId, plannerId } = await params

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { error: 'OPENAI_API_KEY is not configured' },
        { status: 503 }
      )
    }

    const body = await request.json().catch(() => ({}))
    let imagePrompt =
      typeof body?.image_prompt === 'string' ? body.image_prompt.trim() : ''

    if (!imagePrompt) {
      const { data: planner, error: plannerError } = await supabase
        .from('company_content_planners')
        .select('ai_content_results')
        .eq('id', plannerId)
        .eq('company_id', companyId)
        .single()

      if (plannerError || !planner) {
        return NextResponse.json({ error: 'Content planner not found' }, { status: 404 })
      }

      const results = (planner as any).ai_content_results
      const outputJson = results?.output_json
      imagePrompt =
        typeof outputJson?.image_prompt === 'string'
          ? outputJson.image_prompt.trim()
          : ''
    }

    if (!imagePrompt) {
      return NextResponse.json(
        { error: 'No image_prompt found. Generate content first or pass image_prompt in the request body.' },
        { status: 400 }
      )
    }

    const imageRes = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: OPENAI_IMAGE_MODEL,
        prompt: imagePrompt,
        n: 1,
        size: '1024x1024',
        response_format: 'b64_json',
        quality: 'standard',
      }),
    })

    if (!imageRes.ok) {
      const err = await imageRes.json().catch(() => ({}))
      return NextResponse.json(
        { error: err?.error?.message || 'OpenAI image generation failed' },
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

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, buffer, {
        contentType: 'image/png',
        cacheControl: '3600',
        upsert: true,
      })

    if (uploadError) {
      return NextResponse.json(
        { error: uploadError.message || 'Failed to upload image to storage' },
        { status: 500 }
      )
    }

    const { data: urlData } = supabase.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(uploadData.path)
    const publicUrl = urlData.publicUrl

    const { data: planner } = await supabase
      .from('company_content_planners')
      .select('ai_content_results')
      .eq('id', plannerId)
      .eq('company_id', companyId)
      .single()

    const currentResults = ((planner as any)?.ai_content_results || {}) as Record<string, unknown>
    const updatedResults = {
      ...currentResults,
      generated_image_url: publicUrl,
      generated_image_path: uploadData.path,
    }

    const { error: updateError } = await supabase
      .from('company_content_planners')
      .update({ ai_content_results: updatedResults })
      .eq('id', plannerId)
      .eq('company_id', companyId)

    if (updateError) {
      return NextResponse.json(
        { error: 'Failed to save image URL to planner' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      url: publicUrl,
      path: uploadData.path,
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
