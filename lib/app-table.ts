/**
 * Shared defaults for Ant Design `Table` / `AppTable` list screens.
 * Import these when building `pagination` so page sizes and copy stay consistent.
 */

/** Default `pagination.pageSizeOptions` across the app */
export const APP_TABLE_PAGE_SIZE_OPTIONS: (string | number)[] = ['10', '15', '20', '50', '100']

/** `pagination.showTotal` — pass singular entity name, e.g. "company", "user", "ticket" */
export function appTableShowTotal(entityLabel: string) {
  return (total: number) => `Total ${total} ${entityLabel}`
}
