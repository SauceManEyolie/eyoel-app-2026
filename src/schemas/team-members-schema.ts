/**
 * team_members — who belongs to which crew.
 *
 * The name `team_members` and the columns `teamId`, `userId`, `status` are
 * required by DeepSpace: the `'team'` permission level looks rows up here
 * (see /concepts/permissions). A row counts when status is 'active'.
 *
 * Only server actions write this table (createCrew, joinCrew), so nobody can
 * add themselves to a crew without a valid invite code.
 */

import type { CollectionSchema } from 'deepspace/schema'

export const teamMembersSchema: CollectionSchema = {
  name: 'team_members',
  columns: [
    { name: 'teamId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'userId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    {
      name: 'status',
      storage: 'text',
      interpretation: { kind: 'select', options: ['active', 'removed'] },
      default: 'active',
    },
    {
      name: 'crewRole',
      storage: 'text',
      interpretation: { kind: 'select', options: ['lead', 'member'] },
      default: 'member',
    },
  ],
  // One membership row per person per crew, enforced by the server.
  uniqueOn: ['teamId', 'userId'],
  // Members can see the roster of crews they belong to.
  teamField: 'teamId',
  permissions: {
    '*': { read: false, create: false, update: false, delete: false },
    viewer: { read: false, create: false, update: false, delete: false },
    member: { read: 'team', create: false, update: false, delete: false },
    admin: { read: true, create: false, update: false, delete: true },
  },
}
