'use client'

import { EyeOutlined } from '@ant-design/icons'
import { Button } from 'antd'
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
}

export function RecapSnapshotPayloadGridTable({
  sections,
  showActionColumn = false,
  onViewRow,
}: RecapSnapshotPayloadGridTableProps) {
  const allPayloads = useMemo(() => sections.flatMap((s) => s.rows.map((r) => r.payload)), [sections])
  const positionsOrdered = useMemo(() => recapCollectRolePositionsFromPayloads(allPayloads), [allPayloads])
  const taskRolePositions = useMemo(() => recapCollectTaskRolePositionsFromPayloads(allPayloads), [allPayloads])

  const colCount =
    1 +
    3 +
    positionsOrdered.reduce((acc, p) => acc + (recapRoleUsesSingleTimeUsedColumn(p) ? 1 : 4), 0) +
    3 +
    3 +
    1 +
    taskRolePositions.length +
    (showActionColumn ? 1 : 0)

  if (sections.length === 0) return null

  return (
    <div className={styles.scrollWrap}>
      <table className={styles.grid}>
        <thead>
          <tr>
            <th className={`${styles.th} ${styles.thSticky}`}>Team</th>
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
            {showActionColumn ? (
              <th className={styles.th} style={{ width: 88 }}>
                {' '}
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
                    {showActionColumn ? (
                      <td className={styles.td}>
                        <Button
                          type="link"
                          size="small"
                          icon={<EyeOutlined />}
                          onClick={() => onViewRow?.(row.key)}
                        >
                          View
                        </Button>
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
