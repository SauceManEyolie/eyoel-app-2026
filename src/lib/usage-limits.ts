/**
 * Per-user daily counters stored in the `usage_counters` collection.
 *
 * Server-only in practice (it needs action `tools`), but the caps are plain
 * numbers the browser may import to show "N left today".
 *
 * Days are UTC ("2026-11-24"), so every user's count resets at the same
 * moment: midnight UTC (7 pm US Eastern).
 */

import type { ActionResult, ActionTools } from 'deepspace/worker'

export const AI_DAILY_CAP = 10
export const JOIN_FAIL_DAILY_CAP = 20

export type UsageBucket = 'ai' | 'join-fail'

/** Only the three tool methods these helpers need. */
export type CounterTools = Pick<ActionTools, 'query' | 'create' | 'update'>

interface CounterRow extends Record<string, unknown> {
  userId: string
  bucket: UsageBucket
  day: string
  count: number
}

/** "2026-11-24" for the given moment, in UTC. */
export function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10)
}

/** Today's count for this user and bucket (0 if there's no row yet). */
export async function readUsage(
  tools: CounterTools,
  userId: string,
  bucket: UsageBucket,
  now: Date,
): Promise<ActionResult<{ recordId: string | null; count: number }>> {
  const r = await tools.query<CounterRow>('usage_counters', {
    where: { userId, bucket, day: utcDay(now) },
    limit: 1,
  })
  if (!r.success) return r
  const row = r.data.records[0]
  return {
    success: true,
    data: { recordId: row?.recordId ?? null, count: Number(row?.data.count ?? 0) },
  }
}

/** Add one to today's count and return the new count. */
export async function incrementUsage(
  tools: CounterTools,
  userId: string,
  bucket: UsageBucket,
  now: Date,
): Promise<ActionResult<{ count: number }>> {
  const current = await readUsage(tools, userId, bucket, now)
  if (!current.success) return current
  const count = current.data.count + 1
  const write = current.data.recordId
    ? await tools.update<CounterRow>('usage_counters', current.data.recordId, { count })
    : await tools.create<CounterRow>('usage_counters', {
        userId,
        bucket,
        day: utcDay(now),
        count,
      })
  if (!write.success) return write
  return { success: true, data: { count } }
}
