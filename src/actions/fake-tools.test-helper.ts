/**
 * An in-memory stand-in for the server action `tools`, for unit tests only.
 * Supports exactly what our actions use: query (equality `where`), create
 * (with optional record id), update, remove. Enforces `uniqueOn` for
 * crews.inviteCode so the duplicate-retry path can be tested.
 */

import type { CrewTools } from './crews'

type Row = { recordId: string; data: Record<string, unknown> }

export function makeFakeTools() {
  const tables = new Map<string, Row[]>()
  let nextId = 1
  const table = (name: string) => {
    if (!tables.has(name)) tables.set(name, [])
    return tables.get(name)!
  }

  const fake = {
    tables,
    async query(collection: string, opts?: { where?: Record<string, unknown>; limit?: number }) {
      const where = opts?.where ?? {}
      const matches = table(collection).filter((r) =>
        Object.entries(where).every(([k, v]) => r.data[k] === v),
      )
      const records = matches.slice(0, opts?.limit ?? 100)
      return { success: true as const, data: { records, count: records.length } }
    },
    async create(collection: string, data: Record<string, unknown>, recordId?: string) {
      if (collection === 'crews' && table('crews').some((r) => r.data.inviteCode === data.inviteCode)) {
        return {
          success: false as const,
          error: `Duplicate: a record with inviteCode=${String(data.inviteCode)} already exists in crews`,
        }
      }
      const id = recordId ?? `rec_${nextId++}`
      table(collection).push({ recordId: id, data: { ...data } })
      return { success: true as const, data: { recordId: id } }
    },
    async update(collection: string, recordId: string, patch: Record<string, unknown>) {
      const row = table(collection).find((r) => r.recordId === recordId)
      if (!row) return { success: false as const, error: 'not found' }
      Object.assign(row.data, patch)
      return { success: true as const, data: { recordId } }
    },
    async remove(collection: string, recordId: string) {
      tables.set(
        collection,
        table(collection).filter((r) => r.recordId !== recordId),
      )
      return { success: true as const, data: { recordId } }
    },
  }

  // The real tools have generic method signatures; this fake is looser, so we
  // tell TypeScript to treat it as CrewTools.
  return { fake, tools: fake as unknown as CrewTools }
}
