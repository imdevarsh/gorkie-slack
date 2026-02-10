# TODO

- Audit security: authentication boundaries, data access, and tool permissions.
- Revisit why `sandboxId` is stored in Redis with TTL 10 minutes; confirm necessity or adjust.
- take a look at opencode, and it's tools https://github.com/anomalyco/opencode see what we wanna add to agent
- Check With User DMs
- Fix ratelimiting
- fix lint
- it shows restoring snadbox even when its not for a split sec
- enforce gorkie to SEND THE ENTIRE PROMPT to the sandbox agent not split it into smaller bits
- add is thinking tool on prepareStep / tool finish lol bcs when tis writing hug files its stuck at the previous tool