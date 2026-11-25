# Crunch Board

Crunch Board lets study groups ("crews") join with an invite code and post assignments and exams with a course, due date, type and estimated hours. It shows a live crunch-week view of hours per week across the crew, and a "Break it down" button uses AI to turn an item into 4–6 study steps.

**Live app:** https://eyoel-build-2026.app.space

Built on the [DeepSpace](https://docs.deep.space) SDK (Cloudflare Workers). Project rule: use made-up data only.

## Run it

```sh
npm run dev               # local dev server at http://localhost:5173
npm run validate          # type-check + unit tests
npx deepspace deploy      # deploy to https://eyoel-build-2026.app.space
```

The multi-user checks need two accounts: use a normal browser window and a private window, signed in as different accounts.

## Docs

- [BUILD_LOG.md](./BUILD_LOG.md): current status, who did what, decisions, known issues, and the step-by-step history. Only sections titled "Verified by you" record checks done by a person; the rest is agent-reported.
- [CODE_TOUR.md](./CODE_TOUR.md): plain-language walkthroughs of what happens, file by file, for each main action.
