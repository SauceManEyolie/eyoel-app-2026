/**
 * breakItDown — the only paid action. Turns an item into 4–6 study steps
 * with AI and stores them on the item.
 *
 * Order of checks (each one stops the action):
 *   1. signed in            — done by the action route (401 otherwise)
 *   2. the item exists
 *   3. caller is an active member of the item's crew
 *   4. item already has steps and this isn't a redo → return them, no AI call
 *   5. claim one use of the daily cap BEFORE calling the AI
 *   6. call the AI (Claude Haiku via the DeepSpace integration proxy)
 *   7. AI failed to answer → give the use back
 *   8. answer isn't 4–6 clean steps → refuse; the use stays counted (we paid)
 *   9. store the steps on the item
 */

import type { ActionHandler, ActionResult, ActionTools } from 'deepspace/worker'
import type { Env } from '../../worker'
import { buildBreakDownRequest, extractText, parseSteps } from '../lib/ai-steps'
import type { ItemInput } from '../lib/item-validation'
import { AI_DAILY_CAP, refundUsage, reserveUsage } from '../lib/usage-limits'
import { isActiveMember } from './membership'

export const AI_ENDPOINT = 'anthropic/chat-completion'

export type BreakDownTools = Pick<ActionTools, 'query' | 'create' | 'update' | 'get' | 'integration'>

/** How the action reaches the AI. Tests pass a fake; nothing real is called. */
export type CallAi = (body: Record<string, unknown>) => Promise<ActionResult<unknown>>

interface ItemRow extends ItemInput, Record<string, unknown> {
  crewId: string
  steps?: string[]
  stepsAt?: string
}

export interface BreakDownResult {
  steps: string[]
  /** True when the item already had steps and no AI call was made. */
  cached: boolean
  /** AI breakdowns left today for this user (null when nothing was spent). */
  remaining: number | null
}

function fail(error: string): { success: false; error: string } {
  return { success: false, error }
}

export async function breakItDownFor(
  tools: BreakDownTools,
  userId: string,
  params: Record<string, unknown>,
  options: { now?: Date; callAi?: CallAi } = {},
): Promise<ActionResult<BreakDownResult>> {
  const now = options.now ?? new Date()
  const callAi: CallAi = options.callAi ?? ((body) => tools.integration(AI_ENDPOINT, body))

  const itemId = typeof params.itemId === 'string' ? params.itemId : ''
  if (!itemId) return fail('Missing item.')
  const redo = params.redo === true

  const found = await tools.get<ItemRow>('items', itemId)
  if (!found.success) return fail("That item doesn't exist.")
  const item = found.data.record.data

  const member = await isActiveMember(tools, item.crewId, userId)
  if (!member.success) return fail(member.error)
  if (!member.data) return fail("You're not a member of this crew.")

  if (!redo && Array.isArray(item.steps) && item.steps.length > 0) {
    return { success: true, data: { steps: item.steps, cached: true, remaining: null } }
  }

  // Count the call BEFORE spending anything.
  const reserved = await reserveUsage(tools, userId, 'ai', AI_DAILY_CAP, now)
  if (!reserved.success) {
    return 'capReached' in reserved
      ? fail(`You've used all ${AI_DAILY_CAP} AI breakdowns for today. They reset at midnight UTC.`)
      : fail(reserved.error)
  }
  const remaining = Math.max(0, AI_DAILY_CAP - reserved.data.count)

  const ai = await callAi(buildBreakDownRequest(item))
  if (!ai.success) {
    await refundUsage(tools, userId, 'ai', now)
    return fail("Couldn't reach the AI. That try wasn't counted; please try again.")
  }

  const parsed = parseSteps(extractText(ai.data))
  if (!parsed.ok) {
    return fail(`${parsed.error} That try was counted (${remaining} left today).`)
  }

  const saved = await tools.update<ItemRow>('items', itemId, {
    steps: parsed.value,
    stepsAt: now.toISOString(),
  })
  if (!saved.success) return fail(saved.error)

  return { success: true, data: { steps: parsed.value, cached: false, remaining } }
}

export const breakItDown: ActionHandler<Env> = ({ tools, userId, params }) =>
  breakItDownFor(tools, userId, params)
