/**
 * Schema guard tests. These call the SDK's own permission helpers (the same
 * functions the server runs on every write) so we prove the rules, not just
 * read them.
 */

import { describe, expect, it } from 'vitest'
import { canDelete, canUpdate, checkFieldPermissions, lintSchemas } from 'deepspace/worker'
import { schemas } from '../schemas'
import { itemsSchema } from './items-schema'
import { crewsSchema } from './crews-schema'

describe('schemas', () => {
  it('pass the SDK schema lint with no warnings', () => {
    expect(lintSchemas(schemas)).toEqual([])
  })

  describe('crews', () => {
    it('uses the documented crewId column as its team field', () => {
      expect(crewsSchema.teamField).toBe('crewId')
    })

    it('has a required, immutable crewId', () => {
      const crewId = crewsSchema.columns.find((c) => c.name === 'crewId')
      expect(crewId).toMatchObject({ required: true, immutable: true })
    })

    it('keeps invite codes unique', () => {
      expect(crewsSchema.uniqueOn).toEqual(['inviteCode'])
    })

    it('gives browsers no create or update', () => {
      for (const role of ['*', 'viewer', 'member', 'admin']) {
        expect(crewsSchema.permissions[role].create).toBe(false)
        expect(crewsSchema.permissions[role].update).toBe(false)
      }
    })
  })

  describe('items', () => {
    const existing = {
      crewId: 'crew_a',
      title: 'Lab report',
      course: 'CHEM 101',
      dueDate: '2026-12-07',
      type: 'assignment',
      estHours: 3,
    }

    // A row Alice created, as the SDK's permission checks see it.
    const alicesItem = { recordId: 'item_1', createdBy: 'user_alice', data: existing }

    it.each(['member', 'admin'])('gives %s no direct update (edits go through updateItem)', (role) => {
      expect(canUpdate(itemsSchema, role, alicesItem, 'user_alice')).toBe(false)
      expect(canUpdate(itemsSchema, role, alicesItem, 'user_bob')).toBe(false)
    })

    it('lets the author delete their own item, and no other member', () => {
      expect(canDelete(itemsSchema, 'member', alicesItem, 'user_alice')).toBe(true)
      expect(canDelete(itemsSchema, 'member', alicesItem, 'user_bob')).toBe(false)
    })

    it('second lock: editable fields would still be allowed if update were opened', () => {
      expect(checkFieldPermissions(itemsSchema, 'member', { estHours: 5 }, existing)).toBeNull()
    })

    it.each(['member', 'admin'])('blocks %s from writing steps', (role) => {
      const err = checkFieldPermissions(itemsSchema, role, { steps: ['x'] }, existing)
      expect(err).toMatch(/cannot modify field 'steps'/)
    })

    it.each(['member', 'admin'])('blocks %s from writing stepsAt', (role) => {
      const err = checkFieldPermissions(itemsSchema, role, { stepsAt: 'now' }, existing)
      expect(err).toMatch(/cannot modify field 'stepsAt'/)
    })

    it('blocks a member from moving an item to another crew', () => {
      const err = checkFieldPermissions(itemsSchema, 'member', { crewId: 'crew_b' }, existing)
      expect(err).toMatch(/cannot modify field 'crewId'/)
    })

    it('marks crewId immutable (blocks even server-side updates)', () => {
      const crewId = itemsSchema.columns.find((c) => c.name === 'crewId')
      expect(crewId?.immutable).toBe(true)
    })

    it('gives members no direct create', () => {
      expect(itemsSchema.permissions.member.create).toBe(false)
    })
  })
})
