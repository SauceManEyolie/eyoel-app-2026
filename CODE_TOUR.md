# Code Tour — Crunch Board

A walk through what actually happens, file by file, when someone uses the app.
Updated with every step we build.

**Words used below**
- **Browser side / server side**: code running on the user's computer vs. on DeepSpace's computers.
- **Server action**: a named function on the server that the browser can ask to run, e.g. `createCrew`.
- **Token**: a signed pass the browser gets at sign-in. The server checks it to know who is asking.
- **RecordRoom**: DeepSpace's server-side home for the app's data. It holds a small database (SQLite) and the live connections to every open browser tab.
- **Live connection (WebSocket)**: a line kept open between each browser tab and the RecordRoom, so the server can push changes without the page asking.
- **Subscription**: a standing request on that line: "send me all `crews` I'm allowed to see, and tell me when they change." `useQuery` creates one.

---

## Click: "Create crew" (step 2)

### 1. The button — `src/pages/(app)/(protected)/home.tsx`
- `CreateCrewForm` keeps the typed name in `name` and a `busy` flag (lines ~105–107).
- Pressing **Create crew** submits the form, so `onSubmit` runs (line ~109). It stops the browser's default page reload, sets `busy` to true (the button greys out and shows a spinner), and calls `callAction('createCrew', { name })` (line ~112).

### 2. Sending the request — `src/lib/call-action.ts`
- `callAction` gets the signed-in user's token with `getAuthToken()` (line ~16).
- It sends `POST /api/actions/createCrew` with the name as JSON and the token in the `Authorization` header (line ~19).

### 3. The front door on the server — `worker.ts` → `src/server/action-routes.ts`
- `worker.ts` line ~139 plugs in the action routes.
- `action-routes.ts` line ~45 handles any `POST /api/actions/<name>`:
  - `resolveAuth` checks the token (line ~46). No valid token → **401 Unauthorized**, and nothing else happens.
  - `lookupOwn(actions, name)` finds `createCrew` in the list in `src/actions/index.ts` (line ~63).
  - `createActionTools` builds `tools`, the action's way to read/write data **as this user, with permission checks switched off** (line ~66).
  - It runs the action, passing the verified `userId` (line ~67).

### 4. The action — `src/actions/crews.ts`
- `createCrew` hands off to `createCrewFor` (line ~87 → ~45). That function:
  - checks the name isn't blank or longer than 60 characters;
  - makes **one new id** with `crypto.randomUUID()` (line ~57);
  - makes an invite code with `generateInviteCode()` from `src/lib/invite-code.ts`;
  - calls `tools.create('crews', { crewId, name, inviteCode }, crewId)` (line ~65). The same id is the row's id *and* its `crewId`. If the code is already taken it tries a new one, up to 5 times;
  - calls `tools.create('team_members', { teamId: crewId, userId, crewRole: 'lead', … })` (line ~71) to make you the crew's lead. If that fails it deletes the crew (line ~79), so no crew is left that nobody can see.

### 5. Into the database — the RecordRoom
- Each `tools.create` is a message to the RecordRoom (`action-routes.ts`, `execTool`).
- The RecordRoom checks the row against the schema in `src/schemas/crews-schema.ts`: required fields present, name ≤ 60 characters, invite code not already used (`uniqueOn`). Then it saves the row into its SQLite table.

### 6. Back to the screen, two ways at once
- **The reply:** the action returns `{ success: true, data: { crewId, inviteCode } }`, which travels back as JSON to `callAction`, then to `onSubmit`. That shows a "Crew created" message with the code, clears the box, and sets `busy` back to false (lines ~113–118).
- **The live list:** right after saving each row, the RecordRoom looks at every open live connection and asks "may this user read this row?" (the `'team'` rule: the creator, or an active crew member). You created it, so your tab is sent the new `crews` row, then your `team_members` row. `HomePage`'s `useQuery('crews')` and `useQuery('team_members')` (lines ~33–34) receive them, and React redraws the list: the new crew, "1 member", the **Lead** badge and the invite code. No reload, no extra request.

### Side trip: why joining needs a "rebuild" (step 2, Fix A)
- **The problem:** when you **join** with a code, the server only saves a new `team_members` row. The `crews` row doesn't change, so it isn't pushed to your tab. DeepSpace is meant to tell your tab to re-ask its questions, but an SDK bug stops that message (BUILD_LOG.md, "userId vs UserId — RESULT").
- **The workaround:**
  1. After a successful join, `JoinCrewForm` calls `onJoined()`.
  2. That adds 1 to `listVersion` in `HomePage`.
  3. `<CrewList key={listVersion} />` gets a new **key**, a label React uses to tell components apart. A new label makes React throw the old list away and build a new one.
  4. The new list's `useQuery` calls open fresh subscriptions. The server answers them with your memberships as they are *now*, so the crew and its full member count appear.
- It's all in one commented block at the top of `HomePage`.
