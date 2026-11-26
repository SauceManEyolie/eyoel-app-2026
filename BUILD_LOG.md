# Build Log — Crunch Board

> This log was written by Claude Code and edited by me.

- **Live app:** https://eyoel-build-2026.app.space (built from `name = "eyoel-build-2026"` in `wrangler.toml`)
- **GitHub repo:** https://github.com/SauceManEyolie/eyoel-app-2026 (`origin` in `git remote -v`)

**Contents**
- [Current status](#current-status)
- [Who did what](#who-did-what)
- [Main tradeoff](#main-tradeoff)
- [Other decisions](#other-decisions)
- [Known issues and notes](#known-issues-and-notes)
- [How to run](#how-to-run)
- [Step-by-step history](#step-by-step-history)
- [Verified by me in the running app](#2026-11-24--verified-by-me-in-the-running-app)
- [Verified by me on the deployed site](#verified-by-me-on-the-deployed-site)
- [Appendix A: integrations info output](#appendix-a-integrations-info-output)

## Current status

**What the app does.** Crunch Board lets study groups ("crews") join with an invite code and post assignments and exams with a course, due date, type and estimated hours. It shows a live crunch-week view of hours per week across the crew, and a "Break it down" button uses AI to turn an item into 4–6 study steps.

**What works, and how each part was verified**

| Feature | Unit tests (agent-reported) | My two-account check, local | My check, live site |
|---|---|---|---|
| Create crew, join with a code, live crew list | yes | worked | created a crew: worked |
| Items: add, live list in the other window, edit/delete only one's own | yes | worked | added an item: worked |
| Crunch-week totals updating live | yes (week math) | worked | worked |
| Break it down | yes (fake AI only) | clicked once: worked | clicked once: worked |
| Browser integration proxy returns 403 | yes | anthropic and openai: 403 | anthropic and openai: 403, signed in and signed out |
| Crew links no longer 404 (vite config fix) | yes (route test) | 404 went away | 404 fixed |

**Not tested:** the Playwright tests were never run.

**Known limits**
- Hours count toward whoever posted an item.
- The AI cap can be slightly exceeded by simultaneous clicks.
- Only the tab that clicked Join refreshes right after joining a crew.
- The owner sees all crews as admin.

**What I would do next**
- A weekly digest email.
- Leads removing members and rotating invite codes.
- Per-assignee hours.
- Closing the open `GET /api/integrations` listing.

## Who did what

**Claude Code**
- Wrote the code, schemas, server actions, pages, chart, tests and these docs.
- Found the open integration proxy and made it deny-by-default.
- Diagnosed the routing conflict and the dev 404.
- Implemented the join-refresh workaround.
- Made the build commits when I asked (each carries a Co-Authored-By: Claude line).

**Claude in chat** (a separate tool, not Claude Code)
- Reviewed each plan and output.
- Wrote most of my prompts.
- Flagged concerns: the undocumented `_rowId`, the spending exposure, and guessable invite codes.

**Me**
- Chose the idea and scope, and approved or changed each plan.
- Ran every command.
- Tested with two real accounts, locally and on the live site.
- Found that a newly joined crew only appeared after a reload, and chose the fix (Claude Code implemented it).
- Found the 404 on crew links.
- Ran the 403 checks.
- Made the final documentation commits myself on GitHub, and pushed and deployed.


## Main tradeoff

**All writes are checked in one place.**
- Browsers can't create items (`create: false`) or edit them directly (`update: false`) in `src/schemas/items-schema.ts`.
- Every create and edit goes through server actions (`addItem`, `updateItem` in `src/actions/items.ts`) that check membership and validate fields.
- In the schema, `writableFields` and an `immutable` `crewId` back this up.

**Why:** the database can't validate dates, hours or crew membership, and one bad value would break the crunch totals.

**Cost:** more server code, no instant local edits, and delete is still a direct browser action, limited to the item's author (`delete: 'own'`).

## Other decisions

- **Crew privacy:** the `'team'` permission with a real `crewId` column (`teamField: 'crewId'`). We dropped the undocumented `teamField: '_rowId'` because it could change in a later SDK version.
- **Deny-by-default integration proxy:** every browser path under `/api/integrations/` gets 403 unless allowlisted (`src/server/integration-guard.ts`; the allowlist is empty). AI is reached only through the `breakItDown` action.
- **AI cap:** counted **before** the AI call (`reserveUsage`), with a refund (`refundUsage`) if the AI is unreachable. A reply that isn't 4–6 steps still counts.
- **Due dates:** stored as date-only strings (`YYYY-MM-DD`), with week math done in UTC (`src/lib/dates.ts`), so no timezone shifts a deadline.
- **Heavy week:** 15 h per active member (`HEAVY_WEEK_HOURS_PER_MEMBER`), over an 8-week window (`CRUNCH_WEEKS`).
- **Skipped, with the reason for each:**
  - AI chat panel (`ai-chat`): we need one fixed request per item, not a chat.
  - Messaging: not requested.
  - Presence: a nice extra, not needed for the requested features.
  - File uploads: not needed.
  - Payments: not needed.
  - Weekly digest email / cron: out of scope for this build; listed under next steps.
  - Kanban add-on: not requested.
  - Items add-on: its permissions are per owner, not per crew, so it would have been rewritten.
  - Admin page: the owner already has full access as admin.
  - Google Calendar sync: not in the requested scope. It would need per-user Google sign-in (`google` is `billing: 'user'` in `src/integrations.ts`).

## Known issues and notes

**Join-refresh workaround (Fix A)**
- **Where:** the commented `WORKAROUND` block at the top of `HomePage` in `src/pages/(app)/(protected)/home.tsx`. After a successful join, `listVersion` changes, and `<CrewList key={listVersion} />` re-subscribes.
- **Limit:** only the tab that clicked Join refreshes.
- **Remove when** DeepSpace fixes `notifyTeamMembershipChange`: delete `listVersion`, the `key`, and the `onJoined` prop.
- **Bug report for DeepSpace** (agent-reported SDK details):
  > deepspace 0.44.2: `notifyTeamMembershipChange` never fires, so `'team'` access gained via `team_members` doesn't reach open clients until reload.
  > `server.js:4431` / `worker.js:1396` read `record.data.UserId`, but rows are keyed by column name (`userId`, which `'team'` requires), so it always returns early and no `records.resubscribe` is sent.
  > Repro: user B has `/home` open with `useQuery('crews')` (`teamField`, `read: 'team'`), a server action inserts `team_members {teamId, userId: B, status: 'active'}`, and B never receives the crew. Expected: B's tab resubscribes and receives it.

**Dev-only 404 fix (`vite.config.ts`)**
- `optimizeDeps.exclude: ['@generouted/react-router', '@generouted/react-router/lazy']`.
- The cause is a likely explanation (agent-reported): the browser was holding a stale, permanently cached copy of the pre-bundled route list. That's consistent with a fresh private window working, which I saw.
- `vite build` ignores `optimizeDeps`, so deployed builds are unaffected.

**Scaffold files modified**
- `src/server/http-routes.ts`: the integration guard is mounted there.
- Also edited from the scaffold (per git history): `CLAUDE.md` (working agreements), `vite.config.ts`, `src/integrations.ts`, `src/styles.css`, `src/actions/index.ts`, `src/schemas.ts`, `tests/api.spec.ts`, `tests/collab.spec.ts`, and `/home` (moved to `src/pages/(app)/(protected)/home.tsx`).

**Tests**
- Scaffold smoke tests that visit `/home` signed out may need updating, because `/home` now shows a sign-in panel. Not run.

**Other**
- A bare `/crews` shows a blank page; nothing links there.
- The plain `GET /api/integrations` listing (a free list of endpoints) is still open.
- The owner sees all crews as admin.

## How to run

- `npm run dev`: local dev server (Vite + worker) at http://localhost:5173. Per the DeepSpace docs (`/guides/dev-workflow`), this regenerates `.dev.vars`.
- `npm run validate`: type-check plus unit tests.
- `npx deepspace deploy`: deploy to https://eyoel-build-2026.app.space.
- **Two accounts are needed for the multi-user checks:** use a normal window and a private window, signed in as different accounts.

---

# Step-by-step history

## 2026-11-24 — Step 1: Working agreements + plan

**What Claude Code did**
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
- Nothing committed yet; waiting for plan approval. (Later approved and committed as `bf87632`.)

**Checks**
- Read `CLAUDE.md` and confirm the rules match what I want.

**Plan approved with changes:** cap 10 AI calls/user/day; leads cannot delete others' items; lead settings moved to the end (optional); 8-char invite codes from an unambiguous alphabet, plus a limit on wrong guesses; dueDate is date-only text; weeks start Monday; show `integrations info` output before step 5.

## 2026-11-24 — Step 1: Schemas

**What Claude Code did**
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
- Admin (the app owner) is also limited by `writableFields` on items, so even I can't hand-edit `steps` from the browser. Server actions still can, because they bypass the role checks.
- `maxLength` is used on text columns. It's in the installed SDK 0.44.2 types, even though one doc page calls it prototype-only.

**Something to watch in step 2**
- In the SDK source, `notifyTeamMembershipChange` reads `record.data.UserId` (capital U), while the column is `userId`. A user who just joined may not get crew data live until they reload. Claude Code planned to check this in the two-user test rather than guess.

**Checks**
- Read the four schema files. Each starts with a plain-language header.
- Confirm no browser role has `create: true` anywhere in the new files: `grep -n "create: true" src/schemas/*.ts` should only show the scaffold's `admin-schema.ts` line.

## 2026-11-24 — Step 1 follow-up (committed as `bf87632`)
- Replaced `teamField: '_rowId'` with a real `crewId` column (required, immutable) and `teamField: 'crewId'`. **Why:** `'_rowId'` is undocumented and could change in a later SDK version.
- Schema tests now also check crews: `teamField === 'crewId'`, `crewId` required and immutable, unique invite codes, no browser create/update.

## 2026-11-24 — Step 2: createCrew, joinCrew, /home (committed: `733b72a`)

**What Claude Code did**
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
- Checking the cap before the lookup means that once a user hits 20 wrong codes, even the right code is refused until midnight UTC. A tester learns nothing from the 21st guess.

**Tradeoffs**
- The counter is read and then written in two steps. Two wrong guesses sent at exactly the same moment could both count as one. That's fine for brute-force protection (at worst a few extra guesses); not fine for money. Step 5's AI cap will reserve the count *before* calling the AI.
- Someone could create many accounts to get more guesses. The ~852 billion possible codes are the real protection; the limit is a cheap extra.
- No cap on how many crews one user can create. Easy to add later with the same counters.
- Test crews created by the Playwright spec stay in the local dev database (members can't delete crews). They're prefixed `__test-`.

**Live check: userId vs UserId — RESULT**
- **I ran the two-window check:** window B only showed the joined crew (and the member count) **after a reload**. The bug is confirmed.
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
- **I chose A.**

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
- **Confirmed live (by me, re-running the two-window check):** after joining, window B shows the crew and "2 members" without a reload.

**Bug report (to send to DeepSpace)**
> deepspace 0.44.2: `notifyTeamMembershipChange` never fires, so `'team'` access gained via `team_members` doesn't reach open clients until reload.
> `server.js:4431` / `worker.js:1396` read `record.data.UserId`, but rows are keyed by column name (`userId`, which `'team'` requires), so it always returns early and no `records.resubscribe` is sent.
> Repro: user B has `/home` open with `useQuery('crews')` (`teamField`, `read: 'team'`), a server action inserts `team_members {teamId, userId: B, status: 'active'}`, and B never receives the crew. Expected: B's tab resubscribes and receives it.

**Checks**
- Two-window check (summary): A creates a crew and B joins with its code; B's crew list should show the crew without a reload, and A's should change to "2 members". This check found the join-refresh issue.
- Try a wrong code: the message says how many tries are left.
- Signed out, open `/home`: it should show the sign-in panel, not the crew forms.

## 2026-11-24 — Step 3: Crew page, items, add/edit/delete (committed: `c6daa4c`)

**What Claude Code did**
- `src/lib/dates.ts`: date-only helpers. They check "YYYY-MM-DD" is a real date (2000–2099), show it as "Mon, Dec 7", and give today's date on the viewer's own calendar. They never use `new Date("YYYY-MM-DD")`.
- `src/lib/item-validation.ts`: one rule set for the five item fields, used by the server and the form:
  - title: 1–120 characters
  - course: 1–40 characters
  - dueDate: a real YYYY-MM-DD date
  - type: assignment or exam
  - estHours: more than 0, at most 100, in quarter-hour steps
  - It returns only those five fields, so extra fields (`steps`, `crewId`) are dropped.
- `src/actions/membership.ts`: `isActiveMember`, shared by every crew action (step 5 will use it too).
- `src/actions/items.ts`:
  - `addItem`: active member? → valid fields? → create.
  - `updateItem`: item exists? → caller is the author (`createdBy`)? → still an active member? → valid fields? → update. It writes only the five fields; never `crewId`, `steps` or `stepsAt`.
- `src/actions/index.ts`: registers both.
- **Schema change** (`items-schema.ts`): `update` is now `false` for member and admin, so edits **must** go through `updateItem`. Delete stays `'own'` (author only, direct from the browser). Title and course limits are now named constants shared with the form.
- `src/components/items/ItemForm.tsx`: one form for both Add and Edit. It validates before sending and is disabled while sending.
- `src/pages/(app)/(protected)/crews/[id].tsx`: the crew page at `/crews/:id`:
  - live item list, soonest due first, showing who added each item
  - Add form
  - Type and Course filters
  - Edit and Delete buttons only on the viewer's own items; Delete asks for confirmation first
  - non-members (and unknown ids) see "Crew not found"
- `/home`: crew names now link to their crew page.
- Tests:
  - Unit: `dates.test.ts`, `item-validation.test.ts`, `items.test.ts`.
  - Schema tests now use the SDK's own `canUpdate`/`canDelete`.
  - Fake `tools` now records who created each row and supports `get`.
  - Playwright: two-user item test in `collab.spec.ts`; signed-out 401 for `addItem`/`updateItem` in `api.spec.ts`.
- `npm run validate`: **passed** (8 test files, 83 tests). `eslint src tests`: clean. Playwright lists 17 tests; not run (needs the dev server and test accounts, which I run).

**Why**
- The schema can't check that a date is real or that hours are sensible. If authors edited directly from the browser, a bad `dueDate` could break the crunch-week totals in step 4. Routing edits through `updateItem` means every saved item passed the same checks.
- Delete stays direct because there's nothing to validate, and `delete: 'own'` is enforced by the server.

**Tradeoffs**
- `updateItem` and `addItem` each make 2–3 database reads before writing. That's fine at study-group scale.
- An author who leaves a crew can still *see* their old items (the SDK's `'team'` rule always lets the creator read). They can't edit them (`updateItem` checks membership), but `delete: 'own'` still lets them delete. Leaving a crew isn't possible yet, so this is a note for the optional lead step.
- Filters only change what's shown on screen. That's safe, because the server only ever sends items the viewer is allowed to see.
- `src/router.ts` is generated by the router plugin and is gitignored (`.gitignore` line 12), so it's never committed. It will gain a `/crews/:id` entry the next time I run `npm run dev`. (Corrected: an earlier note here wrongly said to commit it.)

**Checks**
- Two-window check (summary): both accounts open the same crew page. A adds an item; B sees it appear without a reload, with no Edit or Delete buttons on it. A edits the hours, and B sees the change live.
- Type an impossible date or `0` hours: the form says why before sending.
- Open `/crews/<some-other-id>`: it should show "Crew not found".

## Playwright status (as of step 5)

**None of the Playwright tests has been run.** Running them needs the dev server (which rewrites `.dev.vars`, off-limits to Claude Code) and test accounts (none on this machine). Per my instruction, Claude Code hasn't written or polished any more Playwright tests since step 3; steps 4 and 5 rely on unit tests plus the manual two-window check.

| Spec | Test | Status |
|---|---|---|
| api.spec.ts | auth proxy forwards to auth worker (scaffold) | not run |
| api.spec.ts | WebSocket endpoint exists (scaffold) | not run |
| api.spec.ts | createCrew / joinCrew / addItem / updateItem refuse signed-out callers with 401 (4 tests) | not run |
| collab.spec.ts | each browser renders its own signed-in account (scaffold) | not run |
| collab.spec.ts | a member who joins by code sees the crew without reloading | not run (I confirmed the same behaviour by hand) |
| collab.spec.ts | a crewmate sees a new item live and can't edit or delete it | not run |
| collab.spec.ts | API status page, two tests (scaffold) | not run |
| smoke.spec.ts | six scaffold smoke tests | not run (the "/home" ones may need updating, since /home now requires sign-in) |

## 2026-11-24 — Step 4: Crunch-week view (committed: `2f4c5c9`)

**What Claude Code did**
- `src/lib/dates.ts`: added `addDays`, `weekStart` (that week's Monday) and `formatWeekRange` ("Dec 7–13"). They use only UTC functions on date-only text.
- `src/lib/crunch.ts`: `buildCrunchWeeks(items, firstWeek, weekCount, memberCount)` is a plain function. It returns one entry per week (empty weeks included) with the total, hours per author, and a heavy flag, plus earlier/later/skipped totals.
  - `HEAVY_WEEK_HOURS_PER_MEMBER = 15`: a week is heavy when its total ÷ active members ≥ 15 h. The reason is in the code comment.
  - `CRUNCH_WEEKS = 8`.
- **Moved** `crews/[id].tsx` → `crews/[id]/index.tsx`. Otherwise the router would make the crew page a wrapper around the crunch page (generouted source, `dist/index.js:20–48`). The address is unchanged.
- Shared crew loading: `src/components/crews/useCrew.ts` (a custom hook) and `CrewNotFound.tsx`, used by both crew pages.
- `src/pages/(app)/(protected)/crews/[id]/crunch.tsx`: the crunch page. It reads items and members live and recalculates with `useMemo`.
- `src/components/crunch/WeekBars.tsx`: horizontal stacked bars drawn in plain HTML/CSS, with no chart library.
  - Each member has a fixed colour by join order. Past 8 members, the rest fold into "Others".
  - Segments are separated by 2px gaps. Each has a hover tooltip.
  - A dashed line marks the heavy threshold. Heavy weeks get a warning tint and a ⚠ "Heavy" label.
  - There's a legend, and a "Show as table" view.
- `src/styles.css`: chart colour variables, taken from the dataviz guide's reference palette and run through its validator.
  - Dark ("slate", card `#161616`): all checks pass.
  - Light ("paper", `#fafafa`): three colours are under 3:1 contrast, so a table view is required. It's there.
- The crew page has a "Crunch week →" link.
- Tests:
  - `src/lib/crunch.test.ts`: Sunday, Monday, mid-week, both sides of the year boundary, US forward/back and EU forward clock changes, and a leap day.
  - The same answers under the New York, Auckland and London timezones. A guard confirms the timezone really switched.
  - Totals per member, empty weeks, earlier/later, exact quarter hours, skipped items, the heavy line at 44.75 vs 45 h, and zero members.
  - `assign-series.test.ts`: colour order and folding.

**Why**
- Totals are always calculated, never stored, so they can't drift out of date, and live updates come for free from `useQuery`.
- Colours follow the member's join order, not who has the most hours, so a member's colour doesn't change as numbers change.

**Tradeoffs**
- Hours count toward the person who **posted** the item, as approved. A shared assignment everyone must do still only counts once, for its poster.
- The current week is based on the viewer's own calendar date. Someone in a far-off timezone may briefly see a different "This week" around midnight.
- If an author leaves the crew, their items still count. They appear after current members in the legend.

**Checks:** two-window check (summary). A opens Crunch week, then B adds items due this week. A's weekly total, B's coloured segment and, past the threshold, the Heavy marker update without a reload. Moving an item's due date moves its hours to the other week, and deleting an item removes them.

## 2026-11-24 — Step 5: Break it down (committed: `de2f1e7`)

**Integration check:** `npx deepspace integrations info anthropic/chat-completion` (full output in [Appendix A](#appendix-a-integrations-info-output)).
- Endpoint `anthropic/chat-completion`, as planned.
- The catalog's **default model is `claude-opus-5-5`** (expensive). Its description names `claude-haiku-5-5`, which we set explicitly.
- Request fields: `model`, `max_tokens`, `system`, `messages`, `temperature`, as planned.
- **No response schema is printed.** The docs say to make one real call to see it. Claude Code didn't, because it costs money. `extractText` reads the Anthropic Messages shape (`content: [{type:'text', text}]`) plus two fallbacks.

**What Claude Code did**
- `src/lib/ai-steps.ts`:
  - `buildBreakDownRequest` uses Haiku, `max_tokens` 600, `temperature` 0.3, and a system prompt asking for JSON `{"steps": [...]}`.
  - `extractText` pulls the reply text out of the response.
  - `parseSteps` handles code fences, strips numbering, and requires exactly 4–6 non-empty text steps of up to 200 characters each.
- `src/lib/usage-limits.ts`: `reserveUsage` (refuses at the cap, otherwise counts one) and `refundUsage`.
- `src/actions/break-down.ts`, the `breakItDown` action:
  1. Signed in? (The action route returns 401 otherwise.)
  2. Item exists?
  3. Active member of the item's crew?
  4. Steps already there and not a redo? Return them with no AI call and no count.
  5. **Count the call against today's cap of 10 BEFORE calling the AI.**
  6. Call the AI.
  7. AI unreachable → refund the count.
  8. Reply isn't 4–6 steps → refuse and store nothing. The count stays, because we paid for the call.
  9. Store `steps` and `stepsAt` on the item.
- **Security fix (first version, replaced by the deny-by-default guard below):** marked `anthropic` as server-only on the browser proxy.
  - Without this, any signed-in user could call Claude straight from the browser at my expense, skipping the cap.
  - Server actions don't use that route, so `breakItDown` still works.
  - Claude Code also checked the scaffold's in-app AI chat routes: they aren't mounted (`inApp: false` in `worker.ts:142`), so there's no other way to reach Claude.
- Crew page, on each item:
  - **Break it down** if the item has no steps; otherwise the numbered steps and a **Redo steps** button.
  - While one breakdown runs, **every** Break it down / Redo button on the page is disabled. This also makes it harder to race the cap.
  - Buttons are disabled when the user has 0 left.
  - "AI breakdowns left today: N of 10" is read live from the user's own `usage_counters` row.
- Tests (all with a **fake AI**; no test calls the real AI, and no `RUN_PAID_TESTS` test exists because I asked for no new Playwright tests):
  - `ai-steps.test.ts`: the request shape and model, reading the reply, and parsing (3/7 steps, bad JSON, empty steps, fences, numbering, long steps).
  - `break-down.test.ts`:
    - Steps are stored.
    - **The counter is already 1 at the moment the fake AI is called.**
    - A non-member is refused with no AI call and no count.
    - Existing steps come back with no AI call and no count; Redo counts.
    - The 11th call is blocked before reaching the AI, and the cap resets at midnight UTC.
    - An unreachable AI is refunded. A 3- or 7-step reply is refused, stores nothing and stays counted.
    - The model is Haiku.
  - `integrations.test.ts`: anthropic is server-only and owner-billed; the browser block works in any letter case.
- `npm run validate`: **passed** (13 test files, 142 tests). `eslint src tests`: clean.

**Tradeoffs**
- **Cap race:** reading the count and adding one are two separate steps. Two calls at exactly the same moment (two tabs) could both get under the cap. The page allows one breakdown at a time, so the worst case is a call or two over, never unlimited.
- Any active member can Break it down or Redo any item in the crew. Each call counts against the clicker's own cap. Redo replaces the steps for everyone.
- Editing an item keeps its old steps. Use Redo if they no longer fit.
- The response shape is assumed, not confirmed (see the integration check above). If the first real click says "The AI sent an empty reply", that's the sign the shape differs. That case is refused, not refunded, so it uses one of the user's 10.

**Checks:** two-window check (summary). A clicks Break it down: every Break it down button is disabled while it runs, 4–6 steps appear, and A's "left today" count drops. B sees the same steps live. B's Redo counts against B's own cap. A browser-console `fetch` to `/api/integrations/...` returns 403. Each real breakdown spends DeepSpace credits; the exact cost was not measured.

## 2026-11-24 — Deny-by-default browser integration proxy (committed: `de2f1e7`)

**Finding**
- The scaffold's browser proxy `/api/integrations/<name>/<endpoint>` (`src/server/http-routes.ts`) treats any integration not listed in `src/integrations.ts` as owner-billed.
  - A **signed-out** visitor got 401, because no integration is marked `anonymous: true`.
  - A **signed-in** visitor was forwarded with `APP_OWNER_JWT`, so **every** catalog endpoint was callable at the owner's expense with no per-user limit: `openai/*`, `exa/*`, `gemini/*`, `email/send` (mail from `<app>@app.space`), and so on.
- Only `anthropic` had been blocked, in the step 5 fix.
- Nothing else reaches integrations from the browser:
  - The agent tools (`src/ai/tools.ts`) are limited to records, schema, user and Yjs tools.
  - The in-app AI chat routes aren't mounted.
  - Server actions use `tools.integration`, which never goes through this route.

**What Claude Code did**
- `src/server/integration-guard.ts`: Hono middleware that answers **403 for every path under `/api/integrations/`** unless it exactly matches the allowlist. Matching ignores letter case, decodes `%2F`-style encoding and drops trailing slashes.
- `src/integrations.ts`: added `BROWSER_INTEGRATION_ALLOWLIST = []` (empty) and removed the step 5 `serverOnly` flag and `isBrowserCallable`, which the guard replaces. `anthropic` stays `{ billing: 'developer' }`.
- `src/server/http-routes.ts` (scaffold): mounted the guard just above the integration routes, and removed the step 5 per-integration check.
- Left open on purpose: the bare `GET /api/integrations` (the free, read-only endpoint list used by the scaffold's `/api-status` debug page). It isn't *under* `/api/integrations/`.
- Tests:
  - `src/server/integration-guard.test.ts` mounts the **real** scaffold routes and checks 14 paths, both signed out and signed in (28 cases), all **403**.
  - The 14 paths:
    - Paid endpoints: `anthropic/chat-completion`, `openai/chat-completion`, `openai/generate-image`, `gemini/generate-image`, `exa/search`, `email/send`, `livekit/token`, `finnhub/stock-price`, `openweathermap/geocoding`.
    - Tricky spellings: `Anthropic/Chat-Completion`, encoded `anthropic%2Fchat-completion`, `email/send/` with a trailing slash.
    - Other routes: `status`, and `oauth/google/disconnect`.
  - Plus: the catalog isn't blocked, and the allowlist only matches exactly.
  - `src/integrations.test.ts` checks the allowlist is empty, no integration is anonymous, and anthropic is owner-billed.
- **Checked that the tests can fail:** with the guard line temporarily removed, 28 of the 33 guard tests failed. After restoring it, all pass.

**Tradeoffs**
- The scaffold's `/api-status` debug page still loads (it uses only the catalog). Any future browser feature that calls an integration directly needs an allowlist entry, and should be done through a server action instead if the endpoint is paid.
- If we ever use Google sign-in for Gmail/Calendar, `status` and `oauth/<provider>/disconnect` would need allowlisting.

**Playwright:** still none run. The scaffold's `collab.spec.ts` "API status page" tests mock the catalog in the browser, so they're unaffected.

## 2026-11-24 — Bug: crew link from /home showed the 404 page (committed: `15f20ec`)

**What I saw:** clicking a crew on `/home` went to `/crews/e7691209-…` and showed the app's own 404 page (`[...all].tsx`), with the dev server still running.

**Diagnosis**
- **Generated types (`src/router.ts`, gitignored):** it lists `/crews/:id` and `/crews/:id/crunch`. It was regenerated at 22:50, after the page move.
- **Files:** `crews/[id]/index.tsx` and `crews/[id]/crunch.tsx` only. There's no leftover `crews/[id].tsx`.
- **Routes:** Claude Code rebuilt the browser's route table with generouted's own code from the real files, and asked react-router's own `matchRoutes`. `/crews/<id>` → crew page, and `/crews/<id>/crunch` → crunch page. So the files and routes are correct.
- **Cause:**
  - The browser's routes don't come from `src/router.ts`. They come from `@generouted/react-router/lazy`, which scans `src/pages` live (`import.meta.glob`).
  - Vite had **pre-bundled** that package into `node_modules/.vite/deps/` at 18:58, before any crew pages existed.
  - Vite serves pre-bundled packages with `Cache-Control: max-age=31536000,immutable` (`node_modules/vite/dist/node/chunks/node.js:20339`). The browser keeps that copy and never asks again, even on reload.
  - So the browser kept a route list from before the crew pages. Generouted's plugin does notice new pages, but only to regenerate the types file (`plugin/index.js:119–123`).
- **Confidence:** this mechanism matches everything above. Claude Code couldn't run the dev server to watch it happen, because it rewrites `.dev.vars`.
  - My own check: in DevTools → Network, find `@generouted_react-router_lazy.js?v=…`. If it says "(disk cache)" or "(memory cache)", that's the stale copy.
- **Crunch page:** `/crews/<id>/crunch` would have 404'd the same way. In the files and route table it matches correctly.

**Fix (smallest)**
- `vite.config.ts`: `optimizeDeps.exclude: ['@generouted/react-router', '@generouted/react-router/lazy']`. Generouted is now served like app code, which the browser re-checks (`no-cache`). This only affects the dev server; `vite build` ignores `optimizeDeps`.
- `src/lib/paths.ts`: `crewPath(id)` and `crunchPath(id)`. The three hand-written crew links now use them, so the test checks the same links the pages build.

**Test**
- `src/routes.test.ts` rebuilds the browser's route table the way generouted does at runtime, from the real page files, and checks:
  - the `/home` crew link opens the crew page, not the 404;
  - the Crunch week link opens the crunch page;
  - `/home` and the 404 still work;
  - there's no stale `crews/[id].tsx`;
  - `vite.config.ts` keeps the exclude.
- **Checked that it can fail:** with `crews/[id]/index.tsx` temporarily moved away, the crew-link test failed. After restoring it, all pass.
- **Limit:** this test can't catch a browser holding a stale cached copy (that needs a running server). It guards the config line that prevents it.
- **Side finding:** a bare `/crews` (no id) renders a blank page, not the 404, because it matches an empty folder route. Nothing links there. Not changed.

`npm run validate`: **passed** (15 test files, 180 tests). `eslint src tests vite.config.ts`: clean.

**To pick up the fix:** stop the dev server, start it again (`npm run dev`), then reload the page once.

## 2026-11-24 — Verified by me in the running app

I tested with two accounts: my normal browser window and a private window.

**Worked**
- Create crew, join with a code, and the crew list updating live.
- Items: adding, the list updating live in the other window, and editing/deleting only my own items.
- Crunch week view: totals update live.
- Break it down: clicked once, and it worked.
- The 404 on crew links went away after the vite config fix.
- Browser console checks against `/api/integrations/anthropic/...` and `/api/integrations/openai/...` both returned 403 **locally**.

**Observation**
- As the app owner (an admin), I see crews I'm not a member of, while the other account does not. This is the admin read-all permission, by design.

**Not tested**
- The Playwright tests: none were run.
- The deployed site, including the `/api/integrations/...` console checks there.

## Verified by me on the deployed site

- The console checks against `/api/integrations/anthropic/...` and `/api/integrations/openai/...` returned 403 on the live site, signed in and signed out.
- On the live site I signed in, created a crew, added an item, and clicked Break it down once. It worked.

## Appendix A: integrations info output

Full output of `npx deepspace integrations info anthropic/chat-completion`, run during step 5:

```
anthropic/chat-completion
  Generate text with a Claude model via the Anthropic Messages API. Free-tier pricing differs from paid-tier pricing. Standard pricing applies to: claude-haiku-5-5, claude-haiku-4-5.
  billing: metered at the provider's actual cost plus platform markup; free-tier pricing differs

Input schema:
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "model": {
      "default": "claude-opus-5-5",
      "type": "string"
    },
    "max_tokens": {
      "default": 4096,
      "type": "number",
      "minimum": 1
    },
    "messages": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "role": {
            "type": "string",
            "enum": [
              "user",
              "assistant"
            ]
          },
          "content": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "array",
                "items": {
                  "type": "object",
                  "propertyNames": {
                    "type": "string"
                  },
                  "additionalProperties": {}
                }
              }
            ]
          }
        },
        "required": [
          "role",
          "content"
        ]
      }
    },
    "system": {
      "type": "string"
    },
    "temperature": {
      "type": "number",
      "minimum": 0,
      "maximum": 1
    }
  },
  "required": [
    "messages"
  ]
}

Example body:
{
  "model": "claude-opus-5-5",
  "max_tokens": 4096
}
```
