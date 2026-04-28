'use client'

import { DeleteOutlined, EditOutlined, EyeOutlined, SyncOutlined } from '@ant-design/icons'
import { Button, Popconfirm, Space } from 'antd'
import { Fragment, useMemo } from 'react'

import styles from '@/components/content/settings/RecapSnapshotsSettingsContent.module.css'
import {
  RECAP_HDR_H,
  recapCollectRolePositionsFromPayloads,
  recapCollectTaskRolePositionsFromPayloads,
  recapFormatIntCount,
  recapGetRole,
  recapHours2,
  recapParseTaskByRole,
  recapRoleUsesSingleTimeUsedColumn,
} from '@/lib/recap-payload-grid'

export type RecapGridRow = { key: string; payload: Record<string, unknown>; teamColumnLabel: string }

export type RecapGridSection = { groupLabel: string; rows: RecapGridRow[] }

export interface RecapSnapshotPayloadGridTableProps {
  sections: RecapGridSection[]
  showActionColumn?: boolean
  onViewRow?: (rowKey: string) => void
  onEditRow?: (rowKey: string) => void
  onDeleteRow?: (rowKey: string) => void
  onRecalculateRow?: (rowKey: string) => void | Promise<void>
  /** When set and equal to row key, the recalculate button shows loading. */
  recalculateLoadingKey?: string | null
}

export function RecapSnapshotPayloadGridTable({
  sections,
  showActionColumn = false,
  onViewRow,
  onEditRow,
  onDeleteRow,
  onRecalculateRow,
  recalculateLoadingKey,
}: RecapSnapshotPayloadGridTableProps) {
  const allPayloads = useMemo(() => sections.flatMap((s) => s.rows.map((r) => r.payload)), [sections])
  const positionsOrdered = useMemo(() => recapCollectRolePositionsFromPayloads(allPayloads), [allPayloads])
  const taskRolePositions = useMemo(() => recapCollectTaskRolePositionsFromPayloads(allPayloads), [allPayloads])

  const showActions =
    showActionColumn && (onViewRow || onEditRow || onDeleteRow || onRecalculateRow)

  const colCount =
    1 +
    3 +
    positionsOrdered.reduce((acc, p) => acc + (recapRoleUsesSingleTimeUsedColumn(p) ? 1 : 4), 0) +
    3 +
    3 +
    1 +
    taskRolePositions.length +
    (showActions ? 1 : 0)

  if (sections.length === 0) return null

  return (
    <div className={styles.scrollWrap}>
      <table className={styles.grid}>
        <thead>
          <tr>
            <th className={`${styles.th} ${styles.thSticky}`} style={{ width: 200 }}>Team</th>
            <th className={styles.th}>Total Team</th>
            <th className={styles.th}>Total Client</th>
            <th className={styles.th}>Total Client Time{RECAP_HDR_H}</th>
            {positionsOrdered.map((pos) =>
              recapRoleUsesSingleTimeUsedColumn(pos) ? (
                <th key={pos} className={styles.th}>
                  {pos} Time Used{RECAP_HDR_H}
                </th>
              ) : (
                <Fragment key={pos}>
                  <th className={styles.th}>{pos} Time Used{RECAP_HDR_H}</th>
                  <th className={styles.th}>{pos} Time Available{RECAP_HDR_H}</th>
                  <th className={styles.th}>{pos} Time Left Over{RECAP_HDR_H}</th>
                  <th className={styles.th}>{pos} % Used</th>
                </Fragment>
              )
            )}
            <th className={styles.th}>Total Time Used{RECAP_HDR_H}</th>
            <th className={styles.th}>Total Time Available{RECAP_HDR_H}</th>
            <th className={styles.th}>Total Time Left Over{RECAP_HDR_H}</th>
            <th className={styles.th}>Left over time{RECAP_HDR_H}</th>
            <th className={styles.th}>Left over per day{RECAP_HDR_H}</th>
            <th className={styles.th}>Available Tasks</th>
            {taskRolePositions.map((pos) => (
              <th key={`at-${pos}`} className={styles.th}>
                Available Tasks - {pos}
              </th>
            ))}
            {showActions ? (
              <th
                className={styles.th}
                style={{ width: onEditRow || onDeleteRow || onRecalculateRow ? 380 : 240 }}
              >
                Actions
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {sections.map((g, gi) => (
            <Fragment key={`${g.groupLabel}-${gi}`}>
              <tr>
                <td className={styles.monthBar} colSpan={colCount}>
                  {g.groupLabel}
                </td>
              </tr>
              {g.rows.map((row) => {
                const p = row.payload
                const totals =
                  p.totals && typeof p.totals === 'object' ? (p.totals as Record<string, unknown>) : {}
                const tasksByPos = new Map(recapParseTaskByRole(p).map((t) => [t.position, t.available_tasks]))
                return (
                  <tr key={row.key}>
                    <td className={`${styles.tdStrong} ${styles.tdSticky}`}>{row.teamColumnLabel}</td>
                    <td className={styles.td}>{String(p.total_team ?? '—')}</td>
                    <td className={styles.td}>{recapFormatIntCount(p.total_client)}</td>
                    <td className={styles.tdNum}>
                      {typeof p.total_client_time_hours === 'number'
                        ? p.total_client_time_hours.toFixed(2)
                        : '—'}
                    </td>
                    {positionsOrdered.map((pos) => {
                      const role = recapGetRole(p, pos)
                      if (recapRoleUsesSingleTimeUsedColumn(pos)) {
                        return (
                          <td key={pos} className={styles.tdNum}>
                            {role ? recapHours2(role.time_used_seconds) : '—'}
                          </td>
                        )
                      }
                      if (!role) {
                        return (
                          <Fragment key={`${row.key}-${pos}`}>
                            <td className={styles.tdNum}>—</td>
                            <td className={styles.tdNum}>—</td>
                            <td className={styles.tdNum}>—</td>
                            <td className={styles.tdNum}>—</td>
                          </Fragment>
                        )
                      }
                      const pct =
                        role.pct_used === null || role.pct_used === undefined
                          ? '—'
                          : `${Number(role.pct_used).toFixed(2)}%`
                      return (
                        <Fragment key={`${row.key}-${pos}`}>
                          <td className={styles.tdNum}>{recapHours2(role.time_used_seconds)}</td>
                          <td className={styles.tdNum}>{recapHours2(role.time_available_seconds)}</td>
                          <td className={styles.tdNum}>{recapHours2(role.time_left_over_seconds)}</td>
                          <td className={styles.tdNum}>{pct}</td>
                        </Fragment>
                      )
                    })}
                    <td className={styles.tdNum}>{recapHours2(totals.total_time_used_seconds)}</td>
                    <td className={styles.tdNum}>{recapHours2(totals.total_time_available_seconds)}</td>
                    <td className={styles.tdNum}>{recapHours2(totals.total_time_left_over_seconds)}</td>
                    <td className={styles.tdNum}>{recapHours2(p.left_over_time_seconds)}</td>
                    <td className={styles.tdNum}>{recapHours2(p.left_over_per_day_seconds)}</td>
                    <td className={styles.tdNum}>
                      {typeof p.available_tasks === 'number' ? Number(p.available_tasks).toFixed(2) : '—'}
                    </td>
                    {taskRolePositions.map((pos) => (
                      <td key={`${row.key}-at-${pos}`} className={styles.tdNum}>
                        {tasksByPos.has(pos) ? Number(tasksByPos.get(pos)).toFixed(2) : '—'}
                      </td>
                    ))}
                    {showActions ? (
                      <td className={styles.td}>
                        <Space size={0} wrap>
                          {onViewRow ? (
                            <Button
                              type="link"
                              size="small"
                              icon={<EyeOutlined />}
                              onClick={() => onViewRow(row.key)}
                            >
                              Show Raw
                            </Button>
                          ) : null}
                          {onEditRow ? (
                            <Button
                              type="link"
                              size="small"
                              icon={<EditOutlined />}
                              onClick={() => onEditRow(row.key)}
                            >
                              Edit
                            </Button>
                          ) : null}
                          {onRecalculateRow ? (
                            <Button
                              type="link"
                              size="small"
                              icon={<SyncOutlined />}
                              loading={recalculateLoadingKey === row.key}
                              onClick={() => {
                                void onRecalculateRow(row.key)
                              }}
                            >
                              Recalculate
                            </Button>
                          ) : null}
                          {onDeleteRow ? (
                            <Popconfirm
                              title="Hapus recap ini?"
                              description="Data tidak dapat dikembalikan."
                              okText="Hapus"
                              cancelText="Batal"
                              okButtonProps={{ danger: true }}
                              onConfirm={() => onDeleteRow(row.key)}
                            >
                              <Button type="link" danger size="small" icon={<DeleteOutlined />}>
                                Delete
                              </Button>
                            </Popconfirm>
                          ) : null}
                        </Space>
                      </td>
                    ) : null}
                  </tr>
                )
              })}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  )
}
