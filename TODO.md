# TODO

- Audit security: authentication boundaries, data access, and tool permissions.
- Revisit why `sandboxId` is stored in Redis with TTL 10 minutes; confirm necessity or adjust.
- take a look at opencode, and it's tools https://github.com/anomalyco/opencode see what we wanna add to agent
- Check With User DMs
- Fix ratelimiting
- fix lint
- TODO: Langfuse shows daytona tools run in sandbox tool? it is very cursed
- TODO: Test multiple prompt / queue
- TODO: Test if it self-timeouts without interaction
- TODO: re-eval pricing
- TODO: add observability and better loggign sandbox
- The sandbox.ts is so cluttered, same with session.ts
- remove REFACTOR.md
- investigate why it takes insane amounts of tme to startup
- compare codebase with other examples