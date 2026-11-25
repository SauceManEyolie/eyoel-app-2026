/**
 * "Is this person an active member of this crew?" — the check every crew
 * action runs first, because action `tools` skip permission checks.
 */

import type { ActionResult, ActionTools } from 'deepspace/worker'

export type MemberTools = Pick<ActionTools, 'query'>

export async function isActiveMember(
  tools: MemberTools,
  crewId: string,
  userId: string,
): Promise<ActionResult<boolean>> {
  const r = await tools.query('team_members', { where: { teamId: crewId, userId }, limit: 1 })
  if (!r.success) return r
  const row = r.data.records[0]
  return { success: true, data: row?.data.status === 'active' }
}
