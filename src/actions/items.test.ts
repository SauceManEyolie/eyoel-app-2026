import { beforeEach, describe, expect, it } from 'vitest'
import { addItemFor, updateItemFor } from './items'
import { createCrewFor, joinCrewFor } from './crews'
import { makeFakeTools } from './fake-tools.test-helper'

const ALICE = 'user_alice'
const BOB = 'user_bob'
const CAROL = 'user_carol' // never joins

const item = {
  title: 'Lab report 4',
  course: 'CHEM 101',
  dueDate: '2026-12-07',
  type: 'assignment',
  estHours: 3,
}

let fake: ReturnType<typeof makeFakeTools>

/** Alice creates crew_1 (code K7MPQ2XR) and Bob joins it. */
beforeEach(async () => {
  fake = makeFakeTools()
  const crew = await createCrewFor(fake.toolsFor(ALICE), ALICE, 'Orgo', () => 'crew_1', () => 'K7MPQ2XR')
  if (!crew.success) throw new Error(crew.error)
  const join = await joinCrewFor(fake.toolsFor(BOB), BOB, 'K7MPQ2XR')
  if (!join.success) throw new Error(join.error)
})

const items = () => fake.tables.get('items') ?? []

describe('addItemFor', () => {
  it('lets a member add an item, recorded as theirs', async () => {
    const r = await addItemFor(fake.toolsFor(BOB), BOB, { crewId: 'crew_1', ...item })
    expect(r.success).toBe(true)
    expect(items()).toHaveLength(1)
    expect(items()[0]).toMatchObject({ createdBy: BOB, data: { crewId: 'crew_1', ...item } })
  })

  it('refuses a non-member', async () => {
    const r = await addItemFor(fake.toolsFor(CAROL), CAROL, { crewId: 'crew_1', ...item })
    expect(r).toEqual({ success: false, error: "You're not a member of this crew." })
    expect(items()).toHaveLength(0)
  })

  it('refuses a member who was removed', async () => {
    const bobRow = fake.tables.get('team_members')!.find((m) => m.data.userId === BOB)!
    bobRow.data.status = 'removed'
    const r = await addItemFor(fake.toolsFor(BOB), BOB, { crewId: 'crew_1', ...item })
    expect(r.success).toBe(false)
  })

  it('refuses a missing crew', async () => {
    expect((await addItemFor(fake.toolsFor(BOB), BOB, { ...item })).success).toBe(false)
  })

  it.each([
    ['impossible date', { dueDate: '2026-02-30' }],
    ['wrong date format', { dueDate: '12/07/2026' }],
    ['zero hours', { estHours: 0 }],
    ['too many hours', { estHours: 500 }],
    ['hours as text', { estHours: 'three' }],
  ])('refuses %s and saves nothing', async (_label, patch) => {
    const r = await addItemFor(fake.toolsFor(BOB), BOB, { crewId: 'crew_1', ...item, ...patch })
    expect(r.success).toBe(false)
    expect(items()).toHaveLength(0)
  })

  it('ignores extra fields like steps', async () => {
    await addItemFor(fake.toolsFor(BOB), BOB, { crewId: 'crew_1', ...item, steps: ['hack'] })
    expect(items()[0].data.steps).toBeUndefined()
  })
})

describe('updateItemFor', () => {
  async function aliceItemId() {
    const r = await addItemFor(fake.toolsFor(ALICE), ALICE, { crewId: 'crew_1', ...item })
    if (!r.success) throw new Error(r.error)
    return r.data.itemId
  }

  it('lets the author edit their own item', async () => {
    const itemId = await aliceItemId()
    const r = await updateItemFor(fake.toolsFor(ALICE), ALICE, { itemId, ...item, estHours: 5 })
    expect(r.success).toBe(true)
    expect(items()[0].data.estHours).toBe(5)
  })

  it("refuses a member editing another member's item", async () => {
    const itemId = await aliceItemId()
    const r = await updateItemFor(fake.toolsFor(BOB), BOB, { itemId, ...item, title: 'Mine now' })
    expect(r).toEqual({ success: false, error: 'Only the author can edit this item.' })
    expect(items()[0].data.title).toBe('Lab report 4')
  })

  it('refuses invalid fields on edit', async () => {
    const itemId = await aliceItemId()
    const r = await updateItemFor(fake.toolsFor(ALICE), ALICE, { itemId, ...item, dueDate: '2026-13-01' })
    expect(r.success).toBe(false)
    expect(items()[0].data.dueDate).toBe('2026-12-07')
  })

  it('never moves an item to another crew or writes steps', async () => {
    const itemId = await aliceItemId()
    await updateItemFor(fake.toolsFor(ALICE), ALICE, { itemId, ...item, crewId: 'crew_2', steps: ['x'] })
    expect(items()[0].data.crewId).toBe('crew_1')
    expect(items()[0].data.steps).toBeUndefined()
  })

  it('refuses an unknown item', async () => {
    const r = await updateItemFor(fake.toolsFor(ALICE), ALICE, { itemId: 'nope', ...item })
    expect(r).toEqual({ success: false, error: "That item doesn't exist." })
  })
})
