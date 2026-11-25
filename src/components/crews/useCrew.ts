/**
 * useCrew(id) — load one crew, live. A "custom hook": a function whose name
 * starts with `use` and that calls other hooks, so several pages can share
 * the same loading logic.
 *
 * The server only sends the crew if you're a member, so "not found" also
 * covers "not your crew".
 */

import { useQuery } from 'deepspace'

export interface Crew {
  crewId: string
  name: string
  inviteCode: string
}

export function useCrew(crewId: string): { crew: Crew | null; loading: boolean } {
  const q = useQuery<Crew>('crews', { where: { crewId } })
  return { crew: q.records[0]?.data ?? null, loading: q.status === 'loading' }
}
