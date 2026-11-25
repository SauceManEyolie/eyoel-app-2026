/**
 * usage_counters — per-user daily counters for rate limits.
 *
 * One row per (user, bucket, day). Buckets:
 *   'ai'        — Break it down calls (cap 10/day)
 *   'join-fail' — wrong invite codes tried (cap 20/day)
 * `day` is the UTC date "YYYY-MM-DD", so every user's day resets at the same
 * moment regardless of their timezone.
 *
 * Only server actions write here. Users may read their own rows (to show
 * "7 of 10 left today").
 */

import type { CollectionSchema } from 'deepspace/schema'

export const USAGE_BUCKETS = ['ai', 'join-fail']

export const usageCountersSchema: CollectionSchema = {
  name: 'usage_counters',
  columns: [
    { name: 'userId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    {
      name: 'bucket',
      storage: 'text',
      interpretation: { kind: 'select', options: USAGE_BUCKETS },
      required: true,
      immutable: true,
    },
    { name: 'day', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'count', storage: 'number', interpretation: 'plain', default: 0 },
  ],
  uniqueOn: ['userId', 'bucket', 'day'],
  // 'own' checks userId instead of the creator (the creator is the server).
  ownerField: 'userId',
  permissions: {
    '*': { read: false, create: false, update: false, delete: false },
    viewer: { read: false, create: false, update: false, delete: false },
    member: { read: 'own', create: false, update: false, delete: false },
    admin: { read: true, create: false, update: false, delete: true },
  },
}
