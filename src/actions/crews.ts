/**
 * Crew server actions: createCrew and joinCrew.
 *
 * Server actions run on the server with the signed-in caller's verified id
 * (`userId`). Their `tools` skip permission checks, so every check that
 * matters is written out here explicitly. See /guides/server-actions.
 *
 * Each action is a thin wrapper around a plain function (`createCrewFor`,
 * `joinCrewFor`) that takes `tools` as an argument, so unit tests can pass in
 * a fake in-memory `tools`.
 */

import type { ActionHandler, ActionResult, ActionTools } from 'deepspace/worker'
import type { Env } from '../../worker'
import {
  generateInviteCode,
  isWellFormedInviteCode,
  normalizeInviteCode,
} from '../lib/invite-code'
import { incrementUsage, JOIN_FAIL_DAILY_CAP, readUsage } from '../lib/usage-limits'
import { CREW_NAME_MAX } from '../schemas/crews-schema'

/** The tool methods these actions use. */
export type CrewTools = Pick<ActionTools, 'query' | 'create' | 'update' | 'remove'>

interface CrewRow extends Record<string, unknown> {
  crewId: string
  name: string
  inviteCode: string
}

interface MemberRow extends Record<string, unknown> {
  teamId: string
  userId: string
  status: 'active' | 'removed'
  crewRole: 'lead' | 'member'
}

function fail(error: string): { success: false; error: string } {
  return { success: false, error }
}

// ─── createCrew ─────────────────────────────────────────────────────────────

export async function createCrewFor(
  tools: CrewTools,
  userId: string,
  rawName: unknown,
  makeId: () => string = () => crypto.randomUUID(),
  makeCode: () => string = () => generateInviteCode(),
): Promise<ActionResult<{ crewId: string; inviteCode: string }>> {
  const name = typeof rawName === 'string' ? rawName.trim() : ''
  if (!name) return fail('Give your crew a name.')
  if (name.length > CREW_NAME_MAX) return fail(`Crew names can be at most ${CREW_NAME_MAX} characters.`)

  // One id, used twice: as the record id (third argument) and as crewId.
  const crewId = makeId()

  // uniqueOn ['inviteCode'] makes the server refuse a duplicate code.
  // Collisions are astronomically rare, but retry a few times anyway.
  let inviteCode = ''
  let created = false
  for (let attempt = 0; attempt < 5 && !created; attempt++) {
    inviteCode = makeCode()
    const r = await tools.create<CrewRow>('crews', { crewId, name, inviteCode }, crewId)
    if (r.success) created = true
    else if (!r.error.includes('Duplicate')) return fail(r.error)
  }
  if (!created) return fail('Could not make a unique invite code. Please try again.')

  const member = await tools.create<MemberRow>('team_members', {
    teamId: crewId,
    userId,
    status: 'active',
    crewRole: 'lead',
  })
  if (!member.success) {
    // Don't leave a crew nobody can see.
    await tools.remove('crews', crewId)
    return fail(member.error)
  }

  return { success: true, data: { crewId, inviteCode } }
}

export const createCrew: ActionHandler<Env> = ({ tools, userId, params }) =>
  createCrewFor(tools, userId, params.name)

// ─── joinCrew ───────────────────────────────────────────────────────────────

export async function joinCrewFor(
  tools: CrewTools,
  userId: string,
  rawCode: unknown,
  now: Date = new Date(),
): Promise<ActionResult<{ crewId: string; name: string; alreadyMember: boolean }>> {
  // 1. Wrong-guess limit is checked BEFORE looking at the code.
  const usage = await readUsage(tools, userId, 'join-fail', now)
  if (!usage.success) return fail(usage.error)
  if (usage.data.count >= JOIN_FAIL_DAILY_CAP) {
    return fail('Too many wrong codes today. Try again after midnight UTC.')
  }

  // 2. Find the crew. A badly shaped code skips the lookup but still counts.
  const code = normalizeInviteCode(typeof rawCode === 'string' ? rawCode : '')
  let crew: CrewRow | undefined
  if (isWellFormedInviteCode(code)) {
    const found = await tools.query<CrewRow>('crews', { where: { inviteCode: code }, limit: 1 })
    if (!found.success) return fail(found.error)
    crew = found.data.records[0]?.data
  }

  if (!crew) {
    const after = await incrementUsage(tools, userId, 'join-fail', now)
    if (!after.success) return fail(after.error)
    const left = Math.max(0, JOIN_FAIL_DAILY_CAP - after.data.count)
    return fail(`No crew has that code. ${left} ${left === 1 ? 'try' : 'tries'} left today.`)
  }

  // 3. Already in it? Don't create a second row.
  const existing = await tools.query<MemberRow>('team_members', {
    where: { teamId: crew.crewId, userId },
    limit: 1,
  })
  if (!existing.success) return fail(existing.error)
  const row = existing.data.records[0]
  if (row) {
    if (row.data.status === 'active') {
      return { success: true, data: { crewId: crew.crewId, name: crew.name, alreadyMember: true } }
    }
    return fail("You can't rejoin this crew.")
  }

  // 4. Add the caller as a regular member.
  const added = await tools.create<MemberRow>('team_members', {
    teamId: crew.crewId,
    userId,
    status: 'active',
    crewRole: 'member',
  })
  if (!added.success) return fail(added.error)

  return { success: true, data: { crewId: crew.crewId, name: crew.name, alreadyMember: false } }
}

export const joinCrew: ActionHandler<Env> = ({ tools, userId, params }) =>
  joinCrewFor(tools, userId, params.code)
