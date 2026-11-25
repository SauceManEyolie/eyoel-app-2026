/**
 * breakItDown with a FAKE AI. No test here makes a real AI call.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import type { ActionResult } from 'deepspace/worker'
import { breakItDownFor, type BreakDownTools, type CallAi } from './break-down'
import { createCrewFor, joinCrewFor } from './crews'
import { addItemFor } from './items'
import { makeFakeTools } from './fake-tools.test-helper'
import { AI_DAILY_CAP } from '../lib/usage-limits'

const ALICE = 'user_alice'
const BOB = 'user_bob'
const CAROL = 'user_carol' // not a member
const NOW = new Date('2026-11-24T12:00:00Z')
const STEPS = ['Review lecture notes', 'Do practice problems', 'Make a formula sheet', 'Take a timed mock exam']

let fake: ReturnType<typeof makeFakeTools>
let itemId: string

/** A fake AI that records each call and answers with `reply`. */
function fakeAi(reply: ActionResult<unknown> = { success: true, data: { content: [{ type: 'text', text: JSON.stringify({ steps: STEPS }) }] } }) {
  const calls: Record<string, unknown>[] = []
  const counterAtCall: number[] = []
  const callAi: CallAi = async (body) => {
    calls.push(body)
    const row = (fake.tables.get('usage_counters') ?? [])[0]
    counterAtCall.push(Number(row?.data.count ?? 0))
    return reply
  }
  return { callAi, calls, counterAtCall }
}

const tools = (user: string) => fake.toolsFor(user) as unknown as BreakDownTools
const aiCount = (user = BOB) =>
  Number((fake.tables.get('usage_counters') ?? []).find((r) => r.data.userId === user && r.data.bucket === 'ai')?.data.count ?? 0)
const storedSteps = () => fake.tables.get('items')![0].data.steps

beforeEach(async () => {
  fake = makeFakeTools()
  await createCrewFor(fake.toolsFor(ALICE), ALICE, 'Orgo', () => 'crew_1', () => 'K7MPQ2XR')
  await joinCrewFor(fake.toolsFor(BOB), BOB, 'K7MPQ2XR', NOW)
  const r = await addItemFor(fake.toolsFor(ALICE), ALICE, {
    crewId: 'crew_1',
    title: 'Midterm 2',
    course: 'CHEM 101',
    dueDate: '2026-12-07',
    type: 'exam',
    estHours: 6,
  })
  if (!r.success) throw new Error(r.error)
  itemId = r.data.itemId
})

describe('breakItDownFor', () => {
  it('stores 4–6 steps and reports what is left', async () => {
    const ai = fakeAi()
    const r = await breakItDownFor(tools(BOB), BOB, { itemId }, { now: NOW, callAi: ai.callAi })
    expect(r).toEqual({ success: true, data: { steps: STEPS, cached: false, remaining: AI_DAILY_CAP - 1 } })
    expect(storedSteps()).toEqual(STEPS)
    expect(fake.tables.get('items')![0].data.stepsAt).toBe(NOW.toISOString())
  })

  it('counts the call BEFORE calling the AI', async () => {
    const ai = fakeAi()
    await breakItDownFor(tools(BOB), BOB, { itemId }, { now: NOW, callAi: ai.callAi })
    expect(ai.counterAtCall).toEqual([1]) // already 1 when the AI was called
  })

  it('refuses a non-member without calling the AI or counting', async () => {
    const ai = fakeAi()
    const r = await breakItDownFor(tools(CAROL), CAROL, { itemId }, { now: NOW, callAi: ai.callAi })
    expect(r).toEqual({ success: false, error: "You're not a member of this crew." })
    expect(ai.calls).toHaveLength(0)
    expect(aiCount(CAROL)).toBe(0)
  })

  it('refuses an unknown item', async () => {
    const ai = fakeAi()
    const r = await breakItDownFor(tools(BOB), BOB, { itemId: 'nope' }, { now: NOW, callAi: ai.callAi })
    expect(r.success).toBe(false)
    expect(ai.calls).toHaveLength(0)
  })

  it('returns existing steps without calling the AI or counting', async () => {
    const ai = fakeAi()
    await breakItDownFor(tools(BOB), BOB, { itemId }, { now: NOW, callAi: ai.callAi })
    const again = await breakItDownFor(tools(ALICE), ALICE, { itemId }, { now: NOW, callAi: ai.callAi })
    expect(again).toEqual({ success: true, data: { steps: STEPS, cached: true, remaining: null } })
    expect(ai.calls).toHaveLength(1)
    expect(aiCount(ALICE)).toBe(0)
  })

  it('Redo calls the AI again and counts it', async () => {
    const ai = fakeAi()
    await breakItDownFor(tools(BOB), BOB, { itemId }, { now: NOW, callAi: ai.callAi })
    await breakItDownFor(tools(BOB), BOB, { itemId, redo: true }, { now: NOW, callAi: ai.callAi })
    expect(ai.calls).toHaveLength(2)
    expect(aiCount()).toBe(2)
  })

  it(`blocks the ${AI_DAILY_CAP + 1}th call of the day before reaching the AI`, async () => {
    const ai = fakeAi()
    for (let i = 0; i < AI_DAILY_CAP; i++) {
      const r = await breakItDownFor(tools(BOB), BOB, { itemId, redo: true }, { now: NOW, callAi: ai.callAi })
      expect(r.success).toBe(true)
    }
    const blocked = await breakItDownFor(tools(BOB), BOB, { itemId, redo: true }, { now: NOW, callAi: ai.callAi })
    expect(blocked.success === false && blocked.error).toMatch(/used all 10/)
    expect(ai.calls).toHaveLength(AI_DAILY_CAP)
    expect(aiCount()).toBe(AI_DAILY_CAP)
  })

  it('resets the cap at midnight UTC', async () => {
    const ai = fakeAi()
    for (let i = 0; i < AI_DAILY_CAP; i++) {
      await breakItDownFor(tools(BOB), BOB, { itemId, redo: true }, { now: NOW, callAi: ai.callAi })
    }
    const tomorrow = new Date('2026-11-25T00:00:01Z')
    const r = await breakItDownFor(tools(BOB), BOB, { itemId, redo: true }, { now: tomorrow, callAi: ai.callAi })
    expect(r.success).toBe(true)
  })

  it('gives the use back when the AI cannot be reached', async () => {
    const ai = fakeAi({ success: false, error: 'upstream 503' })
    const r = await breakItDownFor(tools(BOB), BOB, { itemId }, { now: NOW, callAi: ai.callAi })
    expect(r.success === false && r.error).toMatch(/wasn't counted/)
    expect(aiCount()).toBe(0)
    expect(storedSteps()).toBeUndefined()
  })

  it.each([
    ['3 steps', STEPS.slice(0, 3)],
    ['7 steps', [...STEPS, 'a', 'b', 'c']],
  ])('refuses %s, stores nothing, and keeps the use counted', async (_label, steps) => {
    const ai = fakeAi({ success: true, data: { content: [{ type: 'text', text: JSON.stringify({ steps }) }] } })
    const r = await breakItDownFor(tools(BOB), BOB, { itemId }, { now: NOW, callAi: ai.callAi })
    expect(r.success === false && r.error).toMatch(/we need 4–6/)
    expect(storedSteps()).toBeUndefined()
    expect(aiCount()).toBe(1)
  })

  it('sends the cheap model, never the catalog default', async () => {
    const ai = fakeAi()
    await breakItDownFor(tools(BOB), BOB, { itemId }, { now: NOW, callAi: ai.callAi })
    expect(ai.calls[0].model).toBe('claude-haiku-5-5')
  })
})
