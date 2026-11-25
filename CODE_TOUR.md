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

---

## Click: "Add item" on a crew page (step 3)

### 1. The page — `src/pages/(app)/(protected)/crews/[id].tsx`
- The `[id]` in the file name means "this part of the address is a value". Opening `/crews/abc123` runs this page, and `useParams()` gives `id = "abc123"`.
- `CrewPage` asks for that crew with `useQuery('crews', { where: { crewId: id } })`. The server only sends it if you're a member. Otherwise you see "Crew not found".
- `CrewItems` asks for the crew's items with `useQuery('items', { where: { crewId } })`. That's a live **subscription**, like the crew list on `/home`.

### 2. The form — `src/components/items/ItemForm.tsx`
- You fill in Title, Course, Due date, Type and Est. hours.
  - The date box (`type="date"`) always hands the code text like `"2026-12-09"`, whatever format your computer displays.
  - Hours are kept as text while you type, and turned into a number on submit.
- Pressing **Add item** runs `handleSubmit`. It checks the fields with `validateItemInput` (`src/lib/item-validation.ts`).
  - If anything is wrong, it shows the message under the form and sends nothing.
  - Otherwise it disables the form and calls the page's `addItem` function.

### 3. To the server — `callAction('addItem', { crewId, ...fields })`
- Same path as Create crew:
  1. `src/lib/call-action.ts` sends the request.
  2. `src/server/action-routes.ts` checks your sign-in token and finds `addItem` in `src/actions/index.ts`.
- `...fields` is JavaScript's "spread": copy every field of this object into the new one.

### 4. The action — `src/actions/items.ts` → `addItemFor`
- Is there a `crewId`? If not, "Missing crew."
- `isActiveMember` (`src/actions/membership.ts`) looks for your `team_members` row in that crew with status `active`. If there isn't one: "You're not a member of this crew."
- `validateItemInput` runs **again**. The server never trusts the browser's check, because anyone can send a request without using our form.
- `tools.create('items', { crewId, ...validFields })` saves the row. The server records **you** as `createdBy`, the item's author.

### 5. Back to every screen in the crew
- **Your screen:** the action replies `{ success: true }`. The page shows "Item added", and the form clears the title and hours, keeping course and type for the next one.
- **Every crewmate's screen:** the database checks each open live connection with the `'team'` rule ("is this person an active member of the item's crew?"). Members get the new row pushed, and their `CrewItems` redraws the list. No reload.

### Who sees which buttons — `ItemRow` in the same page file
- `isMine` is `item.createdBy === your userId`. Only then are **Edit** and **Delete** drawn.
- Hiding the buttons is only for convenience. The real protection is on the server:
  - **Edit** goes through `updateItem`, which refuses anyone but the author.
  - **Delete** is a direct database delete, which the schema allows only for the author (`delete: 'own'`).
