'use client'

import type { TableProps } from 'antd'
import { Table } from 'antd'

export type AppTableProps<RecordType extends object = Record<string, unknown>> = TableProps<RecordType> & {
  /**
   * When true (default), applies the `app-table` class for global layout (full width, etc.).
   * Set to false if you need a bare Table (e.g. nested or special wrappers).
   */
  standardLayout?: boolean
}

/**
 * Standard application table: same defaults everywhere (size, borders, sorter tooltips, layout class).
 * Prefer this over importing `Table` from `antd` directly for new and refactored screens.
 */
export default function AppTable<RecordType extends object = Record<string, unknown>>({
  size = 'middle',
  bordered = false,
  showSorterTooltip = { target: 'sorter-icon' },
  className,
  standardLayout = true,
  ...rest
}: AppTableProps<RecordType>) {
  const mergedClass =
    standardLayout === false
      ? className
      : [className, 'app-table'].filter(Boolean).join(' ').trim() || 'app-table'

  return (
    <Table<RecordType>
      size={size}
      bordered={bordered}
      showSorterTooltip={showSorterTooltip}
      className={mergedClass || undefined}
      {...rest}
    />
  )
}
