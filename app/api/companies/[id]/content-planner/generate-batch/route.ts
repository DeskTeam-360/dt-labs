import { createClient } from '@/utils/supabase/server'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

const OPENAI_CHAT_MODEL = process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini'

const DAY_NAMES: Record<string, number> = {
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
  sun: 0,
}

function parsePreferredDays(input: string): number[] {
  const parts = (input || '')
    .split(/[,;\s]+/)
    .map((s) => s.trim().toLowerCase().slice(0, 3))
    .filter(Boolean)
  const days = [...new Set(parts.map((p) => DAY_NAMES[p]).filter((d) => d !== undefined))]
  return days.length > 0 ? days.sort((a, b) => a - b) : [1, 5] // default Mon, Fri
}

function nextDateForWeekday(from: Date, weekday: number): Date {
  const d = new Date(from)
  const current = d.getDay()
  let diff = weekday - current
  if (diff <= 0) diff += 7
  d.setDate(d.getDate() + diff)
  return d
}

function generatePublishDates(count: number, preferredDays: number[], fromDate: Date): string[] {
  const dates: string[] = []
  const tomorrow = new Date(fromDate)
  tomorrow.setDate(tomorrow.getDate() + 1)
  tomorrow.setHours(0, 0, 0, 0)
  let weekOffset = 0
  for (let i = 0; i < count; i++) {
    const weekday = preferredDays[i % preferredDays.length]
    const base = new Date(tomorrow)
    base.setDate(base.getDate() + weekOffset * 7)
    const d = nextDateForWeekday(base, weekday)
    dates.push(d.toISOString().slice(0, 10))
    if ((i + 1) % preferredDays.length === 0) weekOffset++
  }
  return dates
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const cookieStore = await cookies()
    const supabase = createClient(cookieStore)
    const { id: companyId } = await params

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const gbpPerWeek = Math.max(0, typeof body?.gbp_per_week === 'number' ? body.gbp_per_week : Number(body?.gbp_per_week) || 0)
    const socialPerWeek = Math.max(0, typeof body?.social_per_week === 'number' ? body.social_per_week : Number(body?.social_per_week) || 0)
    const blogsPerWeek = Math.max(0, typeof body?.blogs_per_week === 'number' ? body.blogs_per_week : Number(body?.blogs_per_week) || 0)
    const preferredPostDays = typeof body?.preferred_post_days === 'string' ? body.preferred_post_days.trim() : 'Mon, Fri'

    const total = gbpPerWeek + socialPerWeek + blogsPerWeek
    if (total === 0) {
      return NextResponse.json({ error: 'At least one of gbp_per_week, social_per_week, or blogs_per_week must be > 0' }, { status: 400 })
    }

    const preferredDays = parsePreferredDays(preferredPostDays)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const publishDates = generatePublishDates(total, preferredDays, today)

    const { data: channels } = await supabase
      .from('content_planner_channels')
      .select('id, title')
    const { data: formats } = await supabase
      .from('content_planner_formats')
      .select('id, title')

    const channelByTitle: Record<string, string> = {}
    const formatByTitle: Record<string, string> = {}
    ;(channels || []).forEach((c: { id: string; title: string }) => {
      channelByTitle[c.title.toLowerCase()] = c.id
    })
    ;(formats || []).forEach((f: { id: string; title: string }) => {
      formatByTitle[f.title.toLowerCase()] = f.id
    })

    const gbpChannelId = channelByTitle['gbp'] ?? (channels?.[0] as { id: string })?.id
    const socialChannelId = channelByTitle['social'] ?? (channels?.[0] as { id: string })?.id
    const blogChannelId = channelByTitle['blog'] ?? (channels?.[0] as { id: string })?.id
    const socialFormatId = formatByTitle['social post'] ?? formatByTitle['social'] ?? (formats?.[0] as { id: string })?.id
    const blogFormatId = formatByTitle['blog'] ?? (formats?.[0] as { id: string })?.id
    const gbpFormatId = formatByTitle['website page'] ?? formatByTitle['landing page'] ?? (formats?.[0] as { id: string })?.id

    const { data: intentRows } = await supabase
      .from('content_planner_intents')
      .select('id, title')
      .order('title')
    const intents = ((intentRows || []) as { id: string; title: string }[])
    const intentByTitle: Record<string, string> = {}
    intents.forEach((i) => { intentByTitle[i.title.toLowerCase()] = i.id })
    const intentTitles = intents.map((i) => i.title).join(', ')

    const items: Array<{ channel_id: string; format_id: string; type: string }> = []
    for (let i = 0; i < gbpPerWeek; i++) {
      items.push({ channel_id: gbpChannelId, format_id: gbpFormatId, type: 'gbp' })
    }
    for (let i = 0; i < socialPerWeek; i++) {
      items.push({ channel_id: socialChannelId, format_id: socialFormatId, type: 'social' })
    }
    for (let i = 0; i < blogsPerWeek; i++) {
      items.push({ channel_id: blogChannelId, format_id: blogFormatId, type: 'blog' })
    }

    let metadataPerItem: Array<{ topic: string | null; primary_keyword: string | null; intents: string[]; secondary_keywords: string | null; location: string | null }> = []

    const apiKey = process.env.OPENAI_API_KEY
    if (apiKey) {
      const { data: company } = await supabase
        .from('companies')
        .select('name')
        .eq('id', companyId)
        .single()
      const companyName = (company as { name?: string } | null)?.name ?? 'Company'
      const { data: companyInfo } = await supabase
        .from('companies')
        .select('name, description, address, city, state, zip, country, phone, email, website')
        .eq('id', companyId)
        .single()

      const { data: knowledgeBases } = await supabase
        .from('company_knowledge_bases')
        .select('id, content')
        .eq('company_id', companyId)
        .eq('type', 'company_info')
        .order('updated_at', { ascending: false })

      const knowledgeBaseText =
        (knowledgeBases && knowledgeBases.length > 0)
          ? knowledgeBases
              .map((kb: { id: string; content: string | null }) => (kb.content || '').trim())
              .filter(Boolean)
              .join('\n\n---\n\n')
          : ''

      const channelLabels = items.map((it, idx) => `${idx + 1}. ${it.type.toUpperCase()} (${publishDates[idx]})`).join('\n')

      const systemPrompt = `You are a content strategist. Generate metadata for content planners.

Company: ${companyName}

My Business Information: ${JSON.stringify(companyInfo)}
${knowledgeBaseText ? `\nAdditional Company Knowledge (from knowledge base, type company_info):\n${knowledgeBaseText}\n` : ''}

Available intents (use ONLY these exact titles): ${intentTitles}

For each planner below, return a JSON array with one object per planner in the same order. Each object must have:
- topic: string (concise topic for the content)
- primary_keyword: string (main SEO/service keyword)
- intents: string[] (1-2 intent titles from the list above)
- secondary_keywords: string (comma-separated keywords)
- location: string (target area/city if local business, or empty string)

Planners to generate metadata for:
${channelLabels}

Return ONLY valid JSON array, no markdown or explanation. Example format:
[{"topic":"...","primary_keyword":"...","intents":["Lead Generation"],"secondary_keywords":"...","location":"..."}]`

      try {
        const chatRes = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: OPENAI_CHAT_MODEL,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: 'Generate the metadata for all planners in JSON array format.' },
            ],
            max_tokens: 2000,
            temperature: 0.7,
          }),
        })
        if (chatRes.ok) {
          const chatJson = await chatRes.json()
          const raw = chatJson?.choices?.[0]?.message?.content?.trim() ?? ''
          const cleaned = raw.replace(/^```\w*\n?|\n?```$/g, '').trim()
          const parsed = JSON.parse(cleaned) as Array<{ topic?: string; primary_keyword?: string; intents?: string[]; secondary_keywords?: string; location?: string }>
          if (Array.isArray(parsed) && parsed.length >= items.length) {
            metadataPerItem = parsed.slice(0, items.length).map((p) => ({
              topic: String(p?.topic ?? '').trim() || null,
              primary_keyword: String(p?.primary_keyword ?? '').trim() || null,
              intents: Array.isArray(p?.intents) ? p.intents : [],
              secondary_keywords: String(p?.secondary_keywords ?? '').trim() || null,
              location: String(p?.location ?? '').trim() || null,
            }))
          }
        }
      } catch {
        // Fallback: insert without AI metadata
      }
    }

    const rows = items.map((item, i) => {
      const meta = metadataPerItem[i]
      const intentIds: string[] = []
      if (meta?.intents?.length) {
        meta.intents.forEach((t: string) => {
          const id = intentByTitle[t.toLowerCase()]
          if (id && !intentIds.includes(id)) intentIds.push(id)
        })
      }
      return {
        company_id: companyId,
        channel_id: item.channel_id,
        format_id: item.format_id,
        publish_date: publishDates[i],
        status: 'draft',
        cta_dynamic: true,
        topic: meta?.topic ?? null,
        primary_keyword: meta?.primary_keyword ?? null,
        secondary_keywords: meta?.secondary_keywords ?? null,
        intents: intentIds,
        location: meta?.location ?? null,
      }
    })

    const { data: inserted, error } = await supabase
      .from('company_content_planners')
      .insert(rows)
      .select('id')

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ created: inserted?.length ?? 0, ids: (inserted || []).map((r: { id: string }) => r.id) })
  } catch (error: unknown) {
    const err = error as { message?: string }
    return NextResponse.json(
      { error: err?.message || 'Failed to generate planners' },
      { status: 500 }
    )
  }
}
