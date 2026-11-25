import { describe, expect, it } from 'vitest'
import { AI_MODEL, buildBreakDownRequest, extractText, parseSteps } from './ai-steps'

const item = {
  title: 'Midterm 2',
  course: 'CHEM 101',
  dueDate: '2026-12-07',
  type: 'exam' as const,
  estHours: 6,
}
const json = (steps: unknown) => JSON.stringify({ steps })

describe('buildBreakDownRequest', () => {
  it('uses the cheap model, a token cap and the documented body shape', () => {
    const body = buildBreakDownRequest(item)
    expect(body).toMatchObject({ model: AI_MODEL, max_tokens: 600 })
    expect(AI_MODEL).toBe('claude-haiku-5-5')
    expect(typeof body.system).toBe('string')
    const messages = body.messages as { role: string; content: string }[]
    expect(messages).toHaveLength(1)
    expect(messages[0].role).toBe('user')
    expect(messages[0].content).toContain('Midterm 2')
    expect(messages[0].content).toContain('CHEM 101')
  })
})

describe('extractText', () => {
  it('reads the Anthropic Messages shape', () => {
    expect(extractText({ content: [{ type: 'text', text: 'hi' }] })).toBe('hi')
  })
  it('joins several text blocks and ignores others', () => {
    expect(
      extractText({ content: [{ type: 'text', text: 'a' }, { type: 'tool_use' }, { type: 'text', text: 'b' }] }),
    ).toBe('ab')
  })
  it('accepts a plain string or a text field', () => {
    expect(extractText('x')).toBe('x')
    expect(extractText({ text: 'y' })).toBe('y')
  })
  it('returns null for anything else', () => {
    expect(extractText(null)).toBeNull()
    expect(extractText({ nope: 1 })).toBeNull()
    expect(extractText({ content: [] })).toBeNull()
  })
})

describe('parseSteps', () => {
  const four = ['Review notes', 'Do practice set', 'Make a formula sheet', 'Take a timed mock exam']

  it('accepts 4 to 6 steps', () => {
    expect(parseSteps(json(four))).toEqual({ ok: true, value: four })
    expect(parseSteps(json([...four, 'Rest', 'Sleep early'])).ok).toBe(true)
  })

  it.each([
    ['3 steps', json(four.slice(0, 3)), /3 steps/],
    ['7 steps', json([...four, 'a', 'b', 'c']), /7 steps/],
    ['no JSON', 'Sure! Here are some steps…', /wasn't JSON/],
    ['broken JSON', '{"steps": [', /wasn't JSON|valid JSON/],
    ['no steps list', '{"plan": []}', /no steps/],
    ['an empty step', json([...four.slice(0, 3), '   ']), /empty/],
    ['a non-text step', json([...four.slice(0, 3), 42]), /empty or not text/],
    ['empty reply', null, /empty reply/],
  ])('refuses %s', (_label, text, message) => {
    const r = parseSteps(text)
    expect(r.ok).toBe(false)
    expect(!r.ok && r.error).toMatch(message)
  })

  it('tolerates code fences and strips numbering/bullets', () => {
    const text = '```json\n' + json(['1. Read ch. 4', '2) Notes', '- Quiz yourself', '• Review']) + '\n```'
    expect(parseSteps(text)).toEqual({ ok: true, value: ['Read ch. 4', 'Notes', 'Quiz yourself', 'Review'] })
  })

  it('shortens very long steps', () => {
    const r = parseSteps(json([...four.slice(0, 3), 'x'.repeat(500)]))
    expect(r.ok && r.value[3].length).toBe(200)
  })
})
