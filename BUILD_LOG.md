# Build Log — Crunch Board

## 2026-11-24 — Step 1: Working agreements + plan

**What I did**
- Added a "Working agreements" section to `CLAUDE.md` (kept the existing pointer to `AGENTS.md`).
- Created this `BUILD_LOG.md`.
- Read the DeepSpace docs and proposed a plan (no feature code written).
- Baseline `npm run validate`: **passed** (2 test files, 3 tests).

**Docs read**
- `/concepts/permissions` (roles, `'team'` level, `teamField`, `team_members`, `uniqueOn`, `userBound`)
- `/guides/server-actions` (RBAC-bypassing actions, `tools.integration`)
- `/guides/external-apis` (billing, auth-gate + rate-limit guidance for paid calls)
- `/guides/testing` (multi-user `users` fixture, test accounts, mocking only external boundaries)
- `/sdk-reference/worker/schemas` (`writableFields`, `immutable`, schema lint)
- CLI catalogs: `deepspace add --list`, `deepspace integrations info anthropic/chat-completion`

**Tradeoffs**
- Nothing committed yet; waiting for plan approval.

**Verify yourself**
- Read `CLAUDE.md` and confirm the rules match what you want.

**Plan approved with changes:** cap 10 AI calls/user/day; leads cannot delete others' items; lead settings moved to the end (optional); 8-char invite codes from an unambiguous alphabet, plus a limit on wrong guesses; dueDate is date-only text; weeks start Monday; show `integrations info` output before step 5.

## 2026-11-24 — Step 1: Schemas

**What I did**
- Added `src/schemas/crews-schema.ts`, `team-members-schema.ts`, `items-schema.ts`, `usage-counters-schema.ts`, and registered them in `src/schemas.ts`.
- Added `src/schemas/schemas.test.ts`. It calls the SDK's own `checkFieldPermissions` and `lintSchemas`, the same functions the server runs.
- `npm run validate`: **passed** (3 test files, 16 tests, after the `crewId` change). `eslint` on the new files: clean.

**Why**
- Crew privacy uses DeepSpace's `'team'` rule (`/concepts/permissions`). The server only sends crew/item rows to users with an active `team_members` row for that crew.
- `crews` has a real `crewId` column (required, immutable) and `teamField: 'crewId'`. `createCrew` will make one id and pass it both as the record id (third argument of `tools.create`, documented in `/guides/server-actions` → "Upsert by known id") and as `crewId`, so `crewId === recordId`.
- **Dropped `teamField: '_rowId'`:** it was undocumented (found only in SDK source) and could change in a later SDK version.
- Added `uniqueOn: ['inviteCode']` to crews, so the server refuses two crews with the same code (`/concepts/permissions` → `uniqueOn`).
- `usage_counters` holds both caps (AI calls, wrong invite codes) in one table, one row per user, bucket and UTC day.
- `dueDate` uses `interpretation: 'plain'`, not `'date'`. Text is stored exactly as sent, so nothing converts it into a timestamp.

**Tradeoffs**
- Items are created by a server action instead of directly. It's a little more code, but it's the only way to stop someone posting into a crew they aren't in, because `create` can only be `true`/`false`.
- Admin (the app owner) is also limited by `writableFields` on items, so even you can't hand-edit `steps` from the browser. Server actions still can, because they bypass the role checks.
- `maxLength` is used on text columns. It's in the installed SDK 0.44.2 types, even though one doc page calls it prototype-only.

**Something to watch in step 2**
- In the SDK source, `notifyTeamMembershipChange` reads `record.data.UserId` (capital U), while the column is `userId`. A user who just joined may not get crew data live until they reload. I'll check this in the two-user test rather than guess.

**Verify yourself**
- Read the four schema files. Each starts with a plain-language header.
- Confirm no browser role has `create: true` anywhere in the new files: `grep -n "create: true" src/schemas/*.ts` should only show the scaffold's `admin-schema.ts` line.

## 2026-11-24 — Step 1 follow-up (committed as `bf87632`)
- Replaced `teamField: '_rowId'` with a real `crewId` column (required, immutable) and `teamField: 'crewId'`. **Why:** `'_rowId'` is undocumented and could change in a later SDK version.
- Schema tests now also check crews: `teamField === 'crewId'`, `crewId` required and immutable, unique invite codes, no browser create/update.

## 2026-11-24 — Step 2: createCrew, joinCrew, /home (NOT committed yet)

**What I did**
- `src/lib/invite-code.ts`: makes 8-character codes from `23456789ABCDEFGHJKMNPQRSTUVWXYZ` using `crypto.getRandomValues`, discarding biased bytes so every character is equally likely. Also cleans up typed codes ("k7mp-q2xr" → "K7MPQ2XR") and shows them as "K7MP-Q2XR".
- `src/lib/usage-limits.ts`: per-user daily counters in `usage_counters` (UTC days). Caps: AI 10/day (used in step 5), wrong join codes 20/day.
- `src/actions/crews.ts`:
  - `createCrew` makes one id with `crypto.randomUUID()` and passes it as both the record id (third argument of `tools.create`, `/guides/server-actions` "Upsert by known id") and `crewId`. It retries if an invite code collides (`uniqueOn`) and makes the creator the crew's lead. If adding the lead fails, it deletes the crew.
  - `joinCrew` checks the wrong-guess limit **before** looking at the code. Wrong or badly shaped codes add 1 to the count; a right code never does. It returns "already a member" instead of adding a second row.
- `src/actions/index.ts`: registers both actions.
- `src/lib/call-action.ts`: browser helper that POSTs to `/api/actions/<name>` with the sign-in token (`/guides/server-actions` "Call from the client").
- `/home` moved from `(app)/home.tsx` to `(app)/(protected)/home.tsx`. It's the same URL; signed-out visitors now get the sign-in panel. It shows My crews (live), Create crew and Join with code. Buttons are disabled while a request runs.
- Tests:
  - Unit: `src/lib/invite-code.test.ts`, `src/actions/crews.test.ts` (with an in-memory fake of `tools` in `fake-tools.test-helper.ts`).
  - Playwright: a live-join test in `tests/collab.spec.ts`, and signed-out 401 checks for both actions in `tests/api.spec.ts`.
- `npm run validate`: **passed** (5 test files, 34 tests). `eslint src tests`: clean. Playwright lists 14 tests; not run (see below).
- Added `CODE_TOUR.md` (traces "Create crew" end to end).

**Why**
- Crew writes go through server actions so membership can only come from a valid code.
- Checking the cap before the lookup means that once you hit 20 wrong codes, even the right code is refused until midnight UTC. A tester learns nothing from the 21st guess.

**Tradeoffs**
- The counter is read and then written in two steps. Two wrong guesses sent at exactly the same moment could both count as one. That's fine for brute-force protection (at worst a few extra guesses); not fine for money. Step 5's AI cap will reserve the count *before* calling the AI.
- Someone could create many accounts to get more guesses. The ~852 billion possible codes are the real protection; the limit is a cheap extra.
- No cap on how many crews one user can create. Easy to add later with the same counters.
- Test crews created by the Playwright spec stay in the local dev database (members can't delete crews). They're prefixed `__test-`.

**Live check: userId vs UserId — RESULT**
- **You ran the two-window check:** window B only showed the joined crew (and the member count) **after a reload**. The bug is confirmed.
- **Cause (SDK 0.44.2):**
  - When a `team_members` row is written, the server calls `notifyTeamMembershipChange`. It is meant to tell that user's open tabs to re-run their subscriptions (a `records.resubscribe` message).
  - It looks up the user with `record.data.UserId` (capital U). The column is `userId`, so the lookup is always empty and the function returns early.
  - Source: `node_modules/deepspace/dist/server.js:4431` and `worker.js:1396`. Rows are keyed by column name (`rowToData`, `server.js:3970`).
- **Why B doesn't get the crew:**
  - B's `useQuery('crews')` subscription was set up when B had no crews.
  - Joining writes only a `team_members` row; the `crews` row itself doesn't change, so it's never pushed to B.
  - The only thing that would make B ask again is that broken resubscribe.
- Options considered:
  - **A:** rebuild the list in the joining tab.
  - **B:** re-save the crew and member rows from `joinCrew`.
  - **C:** patch the SDK with patch-package.
  - Last resort: full page reload.
- **You chose A.**

**Fix A (workaround, all in one commented block in `src/pages/(app)/(protected)/home.tsx`)**
- **How it works:**
  - `HomePage` keeps a `listVersion` number. After a successful join, `JoinCrewForm` calls `onJoined()`, which adds 1 to it.
  - `<CrewList key={listVersion} />` is then rebuilt by React. Its two `useQuery` calls close their old subscriptions and open new ones.
  - The server answers the new ones using the user's *current* memberships.
- **Why the list became its own component:** a React `key` rebuilds one component and everything inside it. The queries had to move out of `HomePage` into `CrewList`.
- **Limits:**
  - Only fixes the tab that clicked Join. That user's other open tabs or devices still need a reload.
  - Being *removed* from a crew (optional lead feature) won't hide it in already-open tabs either.
  - The list may flash "Loading crews…" for a moment after joining.
  - It relies on `CrewList` being the only place that runs these two queries. The SDK shares identical queries, and only re-asks the server when the last user of one goes away. This is noted in a comment.
- **Remove when** DeepSpace fixes `notifyTeamMembershipChange`: delete `listVersion`, the `key`, and the `onJoined` prop.
- `npm run validate`: **passed** (5 test files, 34 tests). `eslint src tests`: clean.
- **Not yet re-tested live.** Re-run the two-window check, steps 1–9. B's list should now update without a reload.

**Bug report (to send to DeepSpace)**
> deepspace 0.44.2: `notifyTeamMembershipChange` never fires, so `'team'` access gained via `team_members` doesn't reach open clients until reload.
> `server.js:4431` / `worker.js:1396` read `record.data.UserId`, but rows are keyed by column name (`userId`, which `'team'` requires), so it always returns early and no `records.resubscribe` is sent.
> Repro: user B has `/home` open with `useQuery('crews')` (`teamField`, `read: 'team'`), a server action inserts `team_members {teamId, userId: B, status: 'active'}`, and B never receives the crew. Expected: B's tab resubscribes and receives it.

**Verify yourself**
- The two-window check (steps in chat).
- Try a wrong code: the message says how many tries are left.
- Signed out, open `/home`: you should see the sign-in panel, not the crew forms.
