import { describe, expect, it } from 'vitest'
import { validateItemInput } from './item-validation'

const good = {
  title: '  Lab report 4 ',
  course: ' CHEM 101 ',
  dueDate: '2026-12-07',
  type: 'assignment',
  estHours: 3.5,
}

describe('validateItemInput', () => {
  it('accepts a good item and trims text', () => {
    expect(validateItemInput(good)).toEqual({
      ok: true,
      value: {
        title: 'Lab report 4',
        course: 'CHEM 101',
        dueDate: '2026-12-07',
        type: 'assignment',
        estHours: 3.5,
      },
    })
  })

  it('drops extra fields like steps or crewId', () => {
    const r = validateItemInput({ ...good, steps: ['x'], crewId: 'other' })
    expect(r.ok && Object.keys(r.value).sort()).toEqual(
      ['course', 'dueDate', 'estHours', 'title', 'type'],
    )
  })

  it.each([
    ['blank title', { title: '   ' }, /title/i],
    ['long title', { title: 'x'.repeat(121) }, /120/],
    ['blank course', { course: '' }, /course/i],
    ['long course', { course: 'x'.repeat(41) }, /40/],
    ['impossible date', { dueDate: '2026-02-30' }, /real date/],
    ['US-style date', { dueDate: '12/07/2026' }, /YYYY-MM-DD/],
    ['missing date', { dueDate: undefined }, /date/i],
    ['bad type', { type: 'quiz' }, /assignment or exam/],
    ['zero hours', { estHours: 0 }, /hours/i],
    ['negative hours', { estHours: -2 }, /hours/i],
    ['too many hours', { estHours: 101 }, /100/],
    ['odd fraction', { estHours: 1.1 }, /quarter-hour/],
    ['hours as text', { estHours: '3' }, /hours/i],
    ['NaN hours', { estHours: Number.NaN }, /hours/i],
  ])('refuses %s', (_label, patch, message) => {
    const r = validateItemInput({ ...good, ...patch })
    expect(r.ok).toBe(false)
    expect(!r.ok && r.error).toMatch(message)
  })

  it('refuses something that is not an object', () => {
    expect(validateItemInput(null).ok).toBe(false)
    expect(validateItemInput('item').ok).toBe(false)
  })
})
