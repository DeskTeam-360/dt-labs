import { createClient } from '@/utils/supabase/server'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const cookieStore = await cookies()
    const supabase = createClient(cookieStore)
    const { id } = await params

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { datas } = body

    console.log('Received params id:', id)
    console.log('Received datas:', datas)

    if (!id) {
      return NextResponse.json({ error: 'Company ID is required' }, { status: 400 })
    }

    if (!Array.isArray(datas)) {
      return NextResponse.json({ error: 'Invalid data format' }, { status: 400 })
    }

    // Filter out data with null or empty values before upserting
    const dataToUpsert = datas.filter(
      (item) => item.value !== null && item.value !== undefined && String(item.value).trim() !== ''
    ).map((item) => ({
      company_id: id,
      data_template_id: item.data_template_id,
      value: item.value,
    }))

    console.log('Data to upsert:', dataToUpsert)

    if (dataToUpsert.length === 0) {
      return NextResponse.json({ message: 'No valid data to save' }, { status: 200 })
    }

    const { data, error } = await supabase
      .from('company_datas')
      .upsert(dataToUpsert, { onConflict: 'company_id,data_template_id' })
      .select()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ success: true, data, message: `${data.length} data fields saved successfully` })
  } catch (error: any) {
    console.error('Error saving company datas:', error)
    return NextResponse.json({ error: error.message || 'Failed to save company data' }, { status: 500 })
  }
}

