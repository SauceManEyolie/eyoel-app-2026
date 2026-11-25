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

---

## From an item to a week bar (step 4)

### 1. Open the page — `src/pages/(app)/(protected)/crews/[id]/crunch.tsx`
- The crew page links here with **Crunch week →**. The address is `/crews/<id>/crunch`.
- Why the crew page moved to `crews/[id]/index.tsx`: the router builds addresses from file names.
  - A file `[id].tsx` sitting next to a folder `[id]/` would turn into a wrapper around everything in that folder.
  - `index.tsx` means "the page at the folder's own address", so `/crews/<id>` still shows the crew page.
- `useCrew(id)` (`src/components/crews/useCrew.ts`) loads the crew. It's a **custom hook**: a reusable function, starting with `use`, that calls other hooks. Both crew pages use it.

### 2. Live data in
- `useQuery('items', { where: { crewId } })` and `useQuery('team_members', { where: { teamId: crewId } })` are live subscriptions.
- When anyone in the crew adds, edits or deletes an item, the new list arrives and React redraws the page.

### 3. The maths — `src/lib/crunch.ts` → `buildCrunchWeeks`
- `weekStart(todayDateOnly())` gives this week's Monday. Then it makes 8 empty weekly buckets.
- For each item, it finds its week's Monday with `weekStart(item.dueDate)` (`src/lib/dates.ts`), and adds the hours to that week's total and to the author's share.
  - Items due before the first week go into "Earlier"; after the last week, "Later".
- **Heavy:** total ÷ active members ≥ `HEAVY_WEEK_HOURS_PER_MEMBER` (15).
- **No timezone involved:** the date text is split into numbers, and only UTC arithmetic is used. So a Sunday deadline stays in its week on every computer.
- `useMemo` re-runs this only when the items or member count change, not on every redraw.

### 4. The picture — `src/components/crunch/WeekBars.tsx`
- `assignSeries` gives each member a colour slot in join order (`--series-1`… in `src/styles.css`), so colours don't jump around.
- Each week row has three parts:
  - the label;
  - the bar: its width is total ÷ (largest week or the heavy line) × 100%, and inside it each member's segment grows in proportion to their hours;
  - the total, as text.
- A dashed line marks the heavy threshold. Heavy weeks get a tint and a ⚠ "Heavy" label.
- "Show as table" lists the same numbers as text, for anyone who can't tell the colours apart.

---

## Click: "Break it down" (step 5)

### 1. The button — `src/pages/(app)/(protected)/crews/[id]/index.tsx`
- Each `ItemRow` shows the saved steps if the item has them. Otherwise it shows **Break it down**.
- The page also reads your own `usage_counters` row for today, live, to show "AI breakdowns left today: N of 10". Buttons are disabled at 0.
- Clicking calls `breakDown(itemId, redo)` in `CrewItems`. That sets `aiBusyItemId`, which disables **every** Break it down / Redo button on the page until it finishes. Then it calls `callAction('breakItDown', { itemId, redo })`.

### 2. To the server
- Same path as before: `call-action.ts` → `action-routes.ts` (sign-in check, 401 if not signed in) → `breakItDown` in `src/actions/break-down.ts`.

### 3. The action — `breakItDownFor`
1. Load the item (`tools.get`). Check you're an active member of its crew (`isActiveMember`).
2. Steps already there and not a redo? Send them back. No AI call, nothing counted.
3. `reserveUsage(..., 'ai', 10, now)` (`src/lib/usage-limits.ts`): if today's count is already 10, stop. Otherwise add one **now, before any money is spent**.
4. `buildBreakDownRequest(item)` (`src/lib/ai-steps.ts`) builds the request: model `claude-haiku-5-5`, at most 600 tokens, instructions to reply with JSON `{"steps": [...]}`.
5. `tools.integration('anthropic/chat-completion', body)` asks DeepSpace's integration service to call Claude. It's billed to the app owner because `src/integrations.ts` says `billing: 'developer'`.
6. No answer? `refundUsage` gives the count back.
7. `extractText` + `parseSteps` turn the reply into 4–6 clean steps. Anything else is refused and nothing is saved.
8. `tools.update('items', itemId, { steps, stepsAt })` saves them on the item.

### 4. Back to the screens
- **You** get "Steps ready — N left today". Your "left today" line updates by itself, because your counter row changed.
- **Everyone in the crew** gets the updated item pushed live, so the numbered steps appear on their screens too.

### Why a browser can't skip the cap
- The scaffold has a general browser route, `/api/integrations/<name>/<endpoint>`, for calling integrations directly.
- Left as it was, any signed-in user could call any paid endpoint through it at the owner's expense.
- `src/server/integration-guard.ts` is a **middleware**: a function that runs before the route handlers and can stop a request early. `http-routes.ts` mounts it in front of every `/api/integrations/...` route. It answers **403** unless the exact `name/endpoint` is in `BROWSER_INTEGRATION_ALLOWLIST` in `src/integrations.ts`, and that list is empty.
- Server actions reach integrations a different way (`tools.integration`), so `breakItDown` still works.
- So the **only** way to reach Claude, or any other paid service, is through our server actions and their checks.
