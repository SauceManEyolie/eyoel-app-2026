/**
 * Item server actions: addItem and updateItem.
 *
 * Browsers can't create or update items directly (see items-schema.ts), so
 * these are the only ways in. Each one checks, in order:
 *   1. the request names a crew / item,
 *   2. the caller is an active member of that crew (and, for edits, the author),
 *   3. every field passes validateItemInput.
 * Deleting stays a direct browser write: the schema's `delete: 'own'` already
 * limits it to the author, and there's nothing to validate.
 */

import type { ActionHandler, ActionResult, ActionTools } from 'deepspace/worker'
import type { Env } from '../../worker'
import { validateItemInput, type ItemInput } from '../lib/item-validation'
import { isActiveMember } from './membership'

export type ItemTools = Pick<ActionTools, 'query' | 'create' | 'update' | 'get'>

interface ItemRow extends ItemInput, Record<string, unknown> {
  crewId: string
}

function fail(error: string): { success: false; error: string } {
  return { success: false, error }
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

// ─── addItem ────────────────────────────────────────────────────────────────

export async function addItemFor(
  tools: ItemTools,
  userId: string,
  params: Record<string, unknown>,
): Promise<ActionResult<{ itemId: string }>> {
  const crewId = text(params.crewId)
  if (!crewId) return fail('Missing crew.')

  const member = await isActiveMember(tools, crewId, userId)
  if (!member.success) return fail(member.error)
  if (!member.data) return fail("You're not a member of this crew.")

  const v = validateItemInput(params)
  if (!v.ok) return fail(v.error)

  // Only the validated fields plus crewId. Anything else in params is ignored.
  const created = await tools.create<ItemRow>('items', { crewId, ...v.value })
  if (!created.success) return fail(created.error)
  return { success: true, data: { itemId: created.data.recordId } }
}

export const addItem: ActionHandler<Env> = ({ tools, userId, params }) =>
  addItemFor(tools, userId, params)

// ─── updateItem ─────────────────────────────────────────────────────────────

export async function updateItemFor(
  tools: ItemTools,
  userId: string,
  params: Record<string, unknown>,
): Promise<ActionResult<{ itemId: string }>> {
  const itemId = text(params.itemId)
  if (!itemId) return fail('Missing item.')

  const found = await tools.get<ItemRow>('items', itemId)
  if (!found.success) return fail("That item doesn't exist.")
  const item = found.data.record

  // createdBy is set by the server when the row is made (addItem runs as the
  // caller), so it can't be faked by a browser.
  if (item.createdBy !== userId) return fail('Only the author can edit this item.')

  const member = await isActiveMember(tools, item.data.crewId, userId)
  if (!member.success) return fail(member.error)
  if (!member.data) return fail("You're not a member of this crew any more.")

  const v = validateItemInput(params)
  if (!v.ok) return fail(v.error)

  // crewId, steps and stepsAt are never touched here.
  const updated = await tools.update<ItemRow>('items', itemId, { ...v.value })
  if (!updated.success) return fail(updated.error)
  return { success: true, data: { itemId } }
}

export const updateItem: ActionHandler<Env> = ({ tools, userId, params }) =>
  updateItemFor(tools, userId, params)
