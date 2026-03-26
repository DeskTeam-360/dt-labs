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
