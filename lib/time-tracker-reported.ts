/** Billable / reporting seconds: explicit adjustment when set, otherwise tracked duration. */
export function reportedDurationSeconds(row: {
  durationSeconds?: number | null
  durationAdjustment?: number | null
}): number {
  const tracked = row.durationSeconds ?? 0
  const adj = row.durationAdjustment
  if (adj != null && Number.isFinite(adj)) {
    return Math.max(0, Math.floor(adj))
  }
  return Math.max(0, Math.floor(tracked))
}
