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
