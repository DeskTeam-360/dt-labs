/**
 * Kolom Kanban hanya untuk status yang boleh tampil.
 * Mendukung boolean, angka, string Postgres legacy ('t'/'f'), null = default ON (sama schema).
 */
export function isTicketStatusInKanban(showInKanban: unknown): boolean {
  if (showInKanban === null || showInKanban === undefined) return true

  if (typeof showInKanban === 'boolean') return showInKanban

  if (typeof showInKanban === 'number') return showInKanban !== 0

  if (typeof showInKanban === 'string') {
    const t = showInKanban.trim().toLowerCase()
    if (t === '' || t === 'false' || t === 'f' || t === '0' || t === 'no' || t === 'off' || t === 'n') {
      return false
    }
    if (t === 'true' || t === 't' || t === '1' || t === 'yes' || t === 'on' || t === 'y') {
      return true
    }
    return true
  }

  return Boolean(showInKanban)
}

/** Non-empty label for selects and lists (avoids blank Ant Design options when DB title is missing). */
export function ticketStatusDisplayLabel(
  row: { slug: string; title?: string | null; customer_title?: string | null },
  options?: { preferCustomerTitle?: boolean }
): string {
  const slug = String(row.slug ?? '').trim()
  const title = String(row.title ?? '').trim()
  const customerTitle = String(row.customer_title ?? '').trim()
  if (options?.preferCustomerTitle && customerTitle) return customerTitle
  if (title) return title
  if (customerTitle) return customerTitle
  return slug || '—'
}
