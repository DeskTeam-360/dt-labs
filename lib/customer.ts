import { eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import { companies, companyDatas, companyDataTemplates, companyWebsites,db, users } from '@/lib/db'

export async function getCustomerCompanyData() {
  const session = await auth()

  if (!session?.user?.id) {
    redirect('/login')
  }

  const [userRow] = await db
    .select({ companyId: users.companyId })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1)

  const companyId = userRow?.companyId
  if (!companyId) {
    redirect('/dashboard')
  }

  const [companyRow] = await db.select().from(companies).where(eq(companies.id, companyId)).limit(1)
  if (!companyRow) {
    redirect('/dashboard')
  }

  const [companyDatasRows, companyWebsitesRows] = await Promise.all([
    db
      .select({
        data: companyDatas,
        template: companyDataTemplates,
      })
      .from(companyDatas)
      .leftJoin(companyDataTemplates, eq(companyDatas.dataTemplateId, companyDataTemplates.id))
      .where(eq(companyDatas.companyId, companyId)),
    db.select().from(companyWebsites).where(eq(companyWebsites.companyId, companyId)),
  ])

  const companyData = {
    id: companyRow.id,
    name: companyRow.name,
    email: companyRow.email,
    color: companyRow.color,
    is_active: companyRow.isActive ?? true,
    created_at: companyRow.createdAt ? new Date(companyRow.createdAt).toISOString() : '',
    updated_at: companyRow.updatedAt ? new Date(companyRow.updatedAt).toISOString() : '',
    company_datas: companyDatasRows.map((r) => ({
      id: r.data.id,
      company_id: r.data.companyId,
      data_template_id: r.data.dataTemplateId,
      value: r.data.value,
      created_at: r.data.createdAt ? new Date(r.data.createdAt).toISOString() : '',
      updated_at: r.data.updatedAt ? new Date(r.data.updatedAt).toISOString() : '',
      company_data_templates: r.template
        ? { id: r.template.id, title: r.template.title, group: r.template.group }
        : null,
    })),
    company_users: [],
    company_websites: companyWebsitesRows.map((r) => ({
      id: r.id,
      url: r.url,
      title: r.title,
      description: r.description,
      is_primary: r.isPrimary ?? false,
      created_at: r.createdAt ? new Date(r.createdAt).toISOString() : '',
      updated_at: r.updatedAt ? new Date(r.updatedAt).toISOString() : '',
    })),
  }

  return { user: session.user, companyData }
}
