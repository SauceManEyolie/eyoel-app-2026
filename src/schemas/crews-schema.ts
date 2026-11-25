/**
 * Crews — one row per study group.
 *
 * Rows are created only by the `createCrew` server action, never directly by
 * a browser. createCrew picks one new id and uses it twice: as the record id
 * (third argument of `tools.create`) and as the `crewId` column. So for every
 * crew, `crewId === recordId`.
 *
 * A crew is visible only to its own members: the `'team'` read rule plus
 * `teamField: 'crewId'` means "send this row only to users who have an active
 * team_members row whose teamId equals this crew's crewId".
 */

import type { CollectionSchema } from 'deepspace/schema'

/** Invite codes are exactly this long. */
export const INVITE_CODE_LENGTH = 8

/** Longest allowed crew name. */
export const CREW_NAME_MAX = 60

export const crewsSchema: CollectionSchema = {
  name: 'crews',
  columns: [
    // Same value as the record id. Set once by createCrew, never changed.
    { name: 'crewId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'name', storage: 'text', interpretation: 'plain', required: true, maxLength: CREW_NAME_MAX },
    {
      name: 'inviteCode',
      storage: 'text',
      interpretation: 'plain',
      required: true,
      maxLength: INVITE_CODE_LENGTH,
    },
  ],
  // No two crews may share an invite code (server-enforced).
  uniqueOn: ['inviteCode'],
  teamField: 'crewId',
  permissions: {
    '*': { read: false, create: false, update: false, delete: false },
    viewer: { read: false, create: false, update: false, delete: false },
    member: { read: 'team', create: false, update: false, delete: false },
    admin: { read: true, create: false, update: false, delete: true },
  },
}
