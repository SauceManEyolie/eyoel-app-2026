/** Shown when a crew doesn't exist or you're not a member of it. */

import { Link } from 'react-router-dom'
import { EmptyState } from '@/components/ui'

export function CrewNotFound() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <EmptyState
        title="Crew not found"
        description="It doesn't exist, or you're not a member. Ask a crewmate for the invite code."
      />
      <Link to="/home" className="mt-4 inline-block text-sm underline underline-offset-4">
        Back to My crews
      </Link>
    </div>
  )
}
