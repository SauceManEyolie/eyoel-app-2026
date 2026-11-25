/**
 * items — assignments and exams posted into a crew.
 *
 * Created only by the `addItem` server action and edited only by the
 * `updateItem` server action. Both check crew membership and validate every
 * field (see src/lib/item-validation.ts), which a direct browser write would
 * skip. The author may delete their own item directly from the browser.
 *
 * `dueDate` is date-only text "YYYY-MM-DD" with no time and no timezone.
 * `steps` is written only by the `breakItDown` server action.
 */

import type { CollectionSchema } from 'deepspace/schema'

/**
 * The only fields a browser could ever send for an item. Browsers can't
 * update items at all right now (update: false below); this is a second lock
 * in case that's ever loosened.
 */
export const ITEM_EDITABLE_FIELDS = ['title', 'course', 'dueDate', 'type', 'estHours']

export const ITEM_TYPES = ['assignment', 'exam']
export const ITEM_TITLE_MAX = 120
export const ITEM_COURSE_MAX = 40

export const itemsSchema: CollectionSchema = {
  name: 'items',
  columns: [
    // immutable: once set, nobody (not even server code) can change it.
    { name: 'crewId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'title', storage: 'text', interpretation: 'plain', required: true, maxLength: ITEM_TITLE_MAX },
    { name: 'course', storage: 'text', interpretation: 'plain', required: true, maxLength: ITEM_COURSE_MAX },
    // 'plain' on purpose: stored exactly as typed, e.g. "2026-12-07".
    { name: 'dueDate', storage: 'text', interpretation: 'plain', required: true, maxLength: 10 },
    {
      name: 'type',
      storage: 'text',
      interpretation: { kind: 'select', options: ITEM_TYPES },
      required: true,
    },
    { name: 'estHours', storage: 'number', interpretation: 'plain', required: true },
    // Array of 4–6 step strings, filled by AI.
    { name: 'steps', storage: 'text', interpretation: { kind: 'json' } },
    // ISO timestamp of the last successful breakdown.
    { name: 'stepsAt', storage: 'text', interpretation: 'plain' },
  ],
  // Visible only to members of the crew named in crewId.
  teamField: 'crewId',
  permissions: {
    '*': { read: false, create: false, update: false, delete: false },
    viewer: { read: false, create: false, update: false, delete: false },
    member: {
      read: 'team',
      create: false, // addItem action only
      update: false, // updateItem action only (it validates)
      delete: 'own',
      writableFields: ITEM_EDITABLE_FIELDS,
    },
    admin: {
      read: true,
      create: false,
      update: false,
      delete: true,
      writableFields: ITEM_EDITABLE_FIELDS,
    },
  },
}
