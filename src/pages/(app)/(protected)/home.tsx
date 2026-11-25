/**
 * /home — "My crews", plus Create crew and Join with code.
 *
 * Lives under (protected)/, so signed-out visitors see the sign-in panel
 * instead. The URL is still /home (folders in parentheses don't appear in it).
 *
 * The crew list is live: `useQuery('crews')` only receives crews the server
 * says you're a member of, and updates when that changes.
 */

import { useState, type FormEvent } from 'react'
import { useAuth, useQuery } from 'deepspace'
import { Badge, Button, EmptyState, Input, Label, useToast } from '@/components/ui'
import { callAction } from '@/lib/call-action'
import { formatInviteCode, normalizeInviteCode } from '@/lib/invite-code'
import { CREW_NAME_MAX } from '@/schemas/crews-schema'

interface Crew {
  crewId: string
  name: string
  inviteCode: string
}

interface Member {
  teamId: string
  userId: string
  status: 'active' | 'removed'
  crewRole: 'lead' | 'member'
}

export default function HomePage() {
  // ── WORKAROUND: deepspace 0.44.2 membership-resubscribe bug ───────────────
  // After joining a crew, the server should tell this tab to re-run its
  // queries, but the SDK reads `record.data.UserId` (capital U) instead of
  // `userId`, so that message never arrives (server.js:4431, worker.js:1396).
  // Fix: bump `listVersion` after a successful join. Because <CrewList> uses
  // it as its React `key`, React rebuilds the list from scratch, which closes
  // the old useQuery subscriptions and opens fresh ones. The server answers
  // the fresh ones with our *current* memberships.
  // Only covers the tab that clicked Join. See BUILD_LOG.md "Fix A".
  // REMOVE when DeepSpace ships the fix: delete listVersion, the key, and
  // the onJoined prop.
  const [listVersion, setListVersion] = useState(0)

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">My crews</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Study groups you belong to. Start one, or join with a code from a friend.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <CreateCrewForm />
        <JoinCrewForm onJoined={() => setListVersion((v) => v + 1)} />
      </div>

      <CrewList key={listVersion} />
    </div>
  )
}

/**
 * The live list of crews you belong to. It must be the ONLY place on the page
 * that runs these two queries: the SDK shares identical queries between
 * components, and the rebuild trick above only re-asks the server when the
 * last user of a query goes away.
 */
function CrewList() {
  const { userId } = useAuth()
  const crews = useQuery<Crew>('crews', { orderBy: 'createdAt', orderDir: 'desc' })
  const members = useQuery<Member>('team_members')

  const activeMembers = members.records.filter((m) => m.data.status === 'active')
  const memberCount = (crewId: string) => activeMembers.filter((m) => m.data.teamId === crewId).length
  const isLead = (crewId: string) =>
    activeMembers.some(
      (m) => m.data.teamId === crewId && m.data.userId === userId && m.data.crewRole === 'lead',
    )

  return (
    <section aria-labelledby="crew-list-heading" data-testid="crew-list">
      <h2 id="crew-list-heading" className="sr-only">
        Crew list
      </h2>
      {crews.status === 'loading' ? (
        <p className="text-sm text-muted-foreground">Loading crews…</p>
      ) : crews.status === 'error' ? (
        <p className="text-sm text-destructive">Couldn't load crews: {crews.error}</p>
      ) : crews.records.length === 0 ? (
        <EmptyState
          title="No crews yet"
          description="Create a crew for your study group, or join one with an invite code."
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {crews.records.map((crew) => (
            <li
              key={crew.recordId}
              data-testid="crew-row"
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-4"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{crew.data.name}</p>
                <p className="text-sm text-muted-foreground">
                  {memberCount(crew.data.crewId)} member
                  {memberCount(crew.data.crewId) === 1 ? '' : 's'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {isLead(crew.data.crewId) && <Badge variant="secondary">Lead</Badge>}
                <code
                  data-testid="crew-invite-code"
                  className="rounded bg-muted px-2 py-1 text-sm tracking-wider"
                  title="Invite code — share it with your crew"
                >
                  {formatInviteCode(crew.data.inviteCode)}
                </code>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function CreateCrewForm() {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const toast = useToast()

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    const r = await callAction<{ crewId: string; inviteCode: string }>('createCrew', { name })
    setBusy(false)
    if (r.success) {
      toast.success('Crew created', `Invite code: ${formatInviteCode(r.data.inviteCode)}`)
      setName('')
    } else {
      toast.error("Couldn't create crew", r.error)
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
      <Label htmlFor="crew-name">Create a crew</Label>
      <Input
        id="crew-name"
        placeholder="e.g. Orgo Night Owls"
        value={name}
        maxLength={CREW_NAME_MAX}
        onChange={(e) => setName(e.target.value)}
        disabled={busy}
      />
      <Button type="submit" disabled={busy || !name.trim()} loading={busy}>
        Create crew
      </Button>
    </form>
  )
}

/** `onJoined` is called after a successful join (see the workaround in HomePage). */
function JoinCrewForm({ onJoined }: { onJoined: () => void }) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const toast = useToast()

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    const r = await callAction<{ crewId: string; name: string; alreadyMember: boolean }>(
      'joinCrew',
      { code },
    )
    setBusy(false)
    if (r.success) {
      toast.success(r.data.alreadyMember ? "You're already in this crew" : `Joined ${r.data.name}`)
      setCode('')
      onJoined()
    } else {
      toast.error("Couldn't join", r.error)
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
      <Label htmlFor="invite-code">Join with a code</Label>
      <Input
        id="invite-code"
        placeholder="ABCD-EFGH"
        value={code}
        maxLength={12}
        autoComplete="off"
        className="uppercase tracking-wider"
        onChange={(e) => setCode(e.target.value)}
        disabled={busy}
      />
      <Button type="submit" disabled={busy || normalizeInviteCode(code).length === 0} loading={busy}>
        Join crew
      </Button>
    </form>
  )
}
