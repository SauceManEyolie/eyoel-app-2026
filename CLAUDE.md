See [AGENTS.md](./AGENTS.md).

## Working agreements

- **Plan first.** For each feature, write a plan and wait for explicit approval before writing code.
- **Explain as you go.** The developer knows JavaScript but not TypeScript. Explain every new file and function in plain language, and define each TypeScript idea (type, interface, generic, union, `as`, etc.) the first time it appears.
- **Small commits, one feature each.** Run `npm run validate` before every commit and report the result (pass/fail plus the relevant output).
- **Never deploy, push, or touch secrets or `.dev.vars`.** No `deepspace deploy`, `deepspace push`, `git push`, or `deepspace secrets` writes. The developer does those.
- **Keep `BUILD_LOG.md` updated** after each step: what was done, why, the tradeoffs, and what the developer should verify themselves.
- **Use DeepSpace built-ins first.** Check the docs (https://docs.deep.space/llms.txt, then the page as `.md`) before building, and name the doc page used.
- **Paid integration calls** (AI, search, email, etc.) must: require sign-in, disable the triggering button while the call runs, and enforce a per-user cap on the server.
