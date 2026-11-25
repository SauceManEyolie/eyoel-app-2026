/**
 * "Break it down" helpers: build the AI request for an item, and turn the
 * AI's reply into 4–6 clean study steps (or refuse it).
 *
 * Plain functions with no network, so they're unit-tested directly.
 */

import { formatDueDate } from './dates'
import type { ItemInput, Validation } from './item-validation'

/** Small, fast, cheap model. The catalog's default is the expensive Opus. */
export const AI_MODEL = 'claude-haiku-5-5'
/** 6 short steps fit comfortably; also caps the cost of one call. */
export const AI_MAX_TOKENS = 600
export const MIN_STEPS = 4
export const MAX_STEPS = 6
export const STEP_MAX_LENGTH = 200

const SYSTEM_PROMPT =
  'You help university students plan study work. Reply with JSON only, no other text: ' +
  `{"steps": ["...", "..."]} with ${MIN_STEPS} to ${MAX_STEPS} steps. Each step is one short, ` +
  'concrete action (under 20 words), in the order to do them. No numbering, no markdown.'

/** The request body for anthropic/chat-completion (shape from `integrations info`). */
export function buildBreakDownRequest(item: ItemInput): Record<string, unknown> {
  const details = [
    `Title: ${item.title}`,
    `Course: ${item.course}`,
    `Type: ${item.type}`,
    `Due: ${formatDueDate(item.dueDate)}`,
    `Estimated time: ${item.estHours} hours`,
  ].join('\n')
  return {
    model: AI_MODEL,
    max_tokens: AI_MAX_TOKENS,
    temperature: 0.3,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: `Break this into study steps.\n\n${details}` }],
  }
}

/**
 * Pull the reply text out of the AI response. The catalog doesn't print the
 * response shape, so this accepts the Anthropic Messages shape
 * ({ content: [{ type: 'text', text }] }) plus two common fallbacks.
 */
export function extractText(response: unknown): string | null {
  if (typeof response === 'string') return response
  if (typeof response !== 'object' || response === null) return null
  const r = response as Record<string, unknown>
  if (Array.isArray(r.content)) {
    const text = r.content
      .map((block) =>
        typeof block === 'object' && block !== null && (block as { type?: unknown }).type === 'text'
          ? String((block as { text?: unknown }).text ?? '')
          : '',
      )
      .join('')
    return text || null
  }
  if (typeof r.content === 'string') return r.content
  if (typeof r.text === 'string') return r.text
  return null
}

/** Turn the reply text into 4–6 trimmed steps, or say why it can't. */
export function parseSteps(text: string | null): Validation<string[]> {
  if (!text) return { ok: false, error: 'The AI sent an empty reply.' }
  // Tolerate ```json fences and text around the JSON.
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end <= start) return { ok: false, error: "The AI's reply wasn't JSON." }
  let parsed: unknown
  try {
    parsed = JSON.parse(text.slice(start, end + 1))
  } catch {
    return { ok: false, error: "The AI's reply wasn't valid JSON." }
  }
  const raw = (parsed as { steps?: unknown }).steps
  if (!Array.isArray(raw)) return { ok: false, error: "The AI's reply had no steps list." }

  const steps = raw
    .filter((s): s is string => typeof s === 'string')
    .map((s) => s.replace(/^\s*(\d+[.)]|[-*•])\s*/, '').trim())
    .filter((s) => s.length > 0)
    .map((s) => (s.length > STEP_MAX_LENGTH ? `${s.slice(0, STEP_MAX_LENGTH - 1)}…` : s))

  if (steps.length !== raw.length) return { ok: false, error: 'Some AI steps were empty or not text.' }
  if (steps.length < MIN_STEPS || steps.length > MAX_STEPS) {
    return { ok: false, error: `The AI gave ${steps.length} steps; we need ${MIN_STEPS}–${MAX_STEPS}.` }
  }
  return { ok: true, value: steps }
}
