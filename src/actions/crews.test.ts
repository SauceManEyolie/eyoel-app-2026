import { describe, expect, it } from 'vitest'
import { createCrewFor, joinCrewFor } from './crews'
import { makeFakeTools } from './fake-tools.test-helper'
import { JOIN_FAIL_DAILY_CAP } from '../lib/usage-limits'

const ALICE = 'user_alice'
const BOB = 'user_bob'
const NOON = new Date('2026-11-24T12:00:00Z')

async function aliceCrew(tools: ReturnType<typeof makeFakeTools>['tools']) {
  const r = await createCrewFor(tools, ALICE, 'Orgo Night Owls', () => 'crew_1', () => 'K7MPQ2XR')
  if (!r.success) throw new Error(r.error)
  return r.data
}

describe('createCrewFor', () => {
  it('uses one id for both the record id and crewId, and makes the creator lead', async () => {
    const { tables, tools } = makeFakeTools()
    await aliceCrew(tools)
    const crew = tables.get('crews')![0]
    expect(crew.recordId).toBe('crew_1')
    expect(crew.data.crewId).toBe('crew_1')
    expect(tables.get('team_members')![0].data).toMatchObject({
      teamId: 'crew_1',
      userId: ALICE,
      crewRole: 'lead',
      status: 'active',
    })
  })

  it('retries when an invite code is already taken', async () => {
    const { tools } = makeFakeTools()
    await aliceCrew(tools)
    const codes = ['K7MPQ2XR', 'K7MPQ2XR', 'ABCDEFGH']
    const r = await createCrewFor(tools, BOB, 'Calc crew', () => 'crew_2', () => codes.shift()!)
    expect(r).toEqual({ success: true, data: { crewId: 'crew_2', inviteCode: 'ABCDEFGH' } })
  })

  it('rejects a blank or too-long name', async () => {
    const { tools } = makeFakeTools()
    expect((await createCrewFor(tools, ALICE, '   ')).success).toBe(false)
    expect((await createCrewFor(tools, ALICE, 'x'.repeat(61))).success).toBe(false)
    expect((await createCrewFor(tools, ALICE, 42)).success).toBe(false)
  })
})

describe('joinCrewFor', () => {
  it('joins with a right code, typed loosely', async () => {
    const { tables, tools } = makeFakeTools()
    await aliceCrew(tools)
    const r = await joinCrewFor(tools, BOB, ' k7mp-q2xr ', NOON)
    expect(r).toEqual({
      success: true,
      data: { crewId: 'crew_1', name: 'Orgo Night Owls', alreadyMember: false },
    })
    expect(tables.get('team_members')).toHaveLength(2)
  })

  it('does not add a second row when already a member', async () => {
    const { tables, tools } = makeFakeTools()
    await aliceCrew(tools)
    await joinCrewFor(tools, BOB, 'K7MPQ2XR', NOON)
    const again = await joinCrewFor(tools, BOB, 'K7MPQ2XR', NOON)
    expect(again.success && again.data.alreadyMember).toBe(true)
    expect(tables.get('team_members')).toHaveLength(2)
  })

  it('counts wrong and malformed codes, and says how many tries are left', async () => {
    const { tools } = makeFakeTools()
    await aliceCrew(tools)
    const r1 = await joinCrewFor(tools, BOB, 'ZZZZZZZZ', NOON)
    expect(r1).toEqual({ success: false, error: `No crew has that code. ${JOIN_FAIL_DAILY_CAP - 1} tries left today.` })
    const r2 = await joinCrewFor(tools, BOB, 'nope', NOON)
    expect(r2.success === false && r2.error).toContain(`${JOIN_FAIL_DAILY_CAP - 2} tries left`)
  })

  it(`blocks even the right code after ${JOIN_FAIL_DAILY_CAP} wrong guesses in a UTC day`, async () => {
    const { tables, tools } = makeFakeTools()
    await aliceCrew(tools)
    for (let i = 0; i < JOIN_FAIL_DAILY_CAP; i++) {
      expect((await joinCrewFor(tools, BOB, 'ZZZZZZZZ', NOON)).success).toBe(false)
    }
    const blocked = await joinCrewFor(tools, BOB, 'K7MPQ2XR', NOON)
    expect(blocked).toEqual({
      success: false,
      error: 'Too many wrong codes today. Try again after midnight UTC.',
    })
    // Counter stopped at the cap: blocked attempts don't keep incrementing.
    const counter = tables.get('usage_counters')!
    expect(counter).toHaveLength(1)
    expect(counter[0].data).toMatchObject({ userId: BOB, bucket: 'join-fail', day: '2026-11-24', count: JOIN_FAIL_DAILY_CAP })
  })

  it('resets the next UTC day', async () => {
    const { tools } = makeFakeTools()
    await aliceCrew(tools)
    for (let i = 0; i < JOIN_FAIL_DAILY_CAP; i++) await joinCrewFor(tools, BOB, 'ZZZZZZZZ', NOON)
    const tomorrow = new Date('2026-11-25T00:00:01Z')
    expect((await joinCrewFor(tools, BOB, 'K7MPQ2XR', tomorrow)).success).toBe(true)
  })

  it("keeps each user's limit separate", async () => {
    const { tools } = makeFakeTools()
    await aliceCrew(tools)
    for (let i = 0; i < JOIN_FAIL_DAILY_CAP; i++) await joinCrewFor(tools, BOB, 'ZZZZZZZZ', NOON)
    expect((await joinCrewFor(tools, 'user_carol', 'K7MPQ2XR', NOON)).success).toBe(true)
  })

  it('a right code does not use up a try', async () => {
    const { tables, tools } = makeFakeTools()
    await aliceCrew(tools)
    await joinCrewFor(tools, BOB, 'K7MPQ2XR', NOON)
    expect(tables.get('usage_counters') ?? []).toHaveLength(0)
  })
})
