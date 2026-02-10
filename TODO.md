# TODO

- Review Claude refactor of `getContext` to per-thread usage; confirm thread changes do not affect rate limits.
- Expand system prompt examples; AI still gets confused about the attachments directory.
- Audit security: authentication boundaries, data access, and tool permissions.
- Revisit why `sandboxId` is stored in Redis with TTL 10 minutes; confirm necessity or adjust.
- Update system prompt: Gorkie cannot log in or perform authentication, and cannot access GitHub or other sites requiring auth.
- Update system prompt: require web search usage when needed and avoid assuming alternative access methods.
- like claude code store the turns in assistant/turns or whatever so it can see what output etc in json files
- take a look at opencode, and it's tools https://github.com/anomalyco/opencode see what we wanna add to agent
- Check With User DMs
- If the size is more than 2.5gb auto nuke the sandbox, the user is messing with us??