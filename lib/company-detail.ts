/**
 * Server-side helper to fetch company with related data
 * Used by company detail page and API
 */
import { db } from '@/lib/db'
import {
  companies,
  companyDatas,
  companyDataTemplates,
  companyWebsites,
  users,
} from '@/lib/db'
import { eq } from 'drizzle-orm'

export async function getCompanyDetail(id: string) {
  const [companyRow] = await db.select().from(companies).where(eq(companies.id, id)).limit(1)

  if (!companyRow) return null

  // Users tab: users dengan company_id = company ini (1 user = 1 company)
  const [usersRows, companyDatasRows, companyWebsitesRows] = await Promise.all([
    db
      .select()
      .from(users)
      .where(eq(users.companyId, id)),
    db
      .select({
        data: companyDatas,
        template: companyDataTemplates,
      })
      .from(companyDatas)
      .leftJoin(companyDataTemplates, eq(companyDatas.dataTemplateId, companyDataTemplates.id))
      .where(eq(companyDatas.companyId, id)),
    db.select().from(companyWebsites).where(eq(companyWebsites.companyId, id)),
  ])

  const company = companyRow
  const companyUsersList = usersRows.map((u) => ({
    user_id: u.id,
    created_at: u.createdAt ? new Date(u.createdAt).toISOString() : '',
    users: { id: u.id, full_name: u.fullName, email: u.email },
  }))

  const companyDatasList = companyDatasRows.map((r) => ({
    id: r.data.id,
    company_id: r.data.companyId,
    data_template_id: r.data.dataTemplateId,
    value: r.data.value,
    created_at: r.data.createdAt ? new Date(r.data.createdAt).toISOString() : '',
    updated_at: r.data.updatedAt ? new Date(r.data.updatedAt).toISOString() : '',
    company_data_templates: r.template
      ? { id: r.template.id, title: r.template.title, group: r.template.group }
      : null,
  }))

  const companyWebsitesList = companyWebsitesRows.map((r) => ({
    id: r.id,
    company_id: r.companyId,
    url: r.url,
    title: r.title,
    description: r.description,
    is_primary: r.isPrimary ?? false,
    created_at: r.createdAt ? new Date(r.createdAt).toISOString() : '',
    updated_at: r.updatedAt ? new Date(r.updatedAt).toISOString() : '',
  }))

  return {
    id: company.id,
    name: company.name,
    email: company.email,
    color: company.color,
    is_active: company.isActive ?? true,
    created_at: company.createdAt ? new Date(company.createdAt).toISOString() : '',
    updated_at: company.updatedAt ? new Date(company.updatedAt).toISOString() : '',
    company_users: companyUsersList,
    company_datas: companyDatasList,
    company_websites: companyWebsitesList,
  }
}
