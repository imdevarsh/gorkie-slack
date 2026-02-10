# TODO

- Review Claude refactor of `getContext` to per-thread usage; confirm thread changes do not affect rate limits.
- Expand system prompt examples; AI still gets confused about the attachments directory.
- Audit security: authentication boundaries, data access, and tool permissions.
- Revisit why `sandboxId` is stored in Redis with TTL 10 seconds; confirm necessity or remove.
- Code cleanup and consistency pass (naming, types, error handling).
- Update system prompt: Gorkie cannot log in or perform authentication, and cannot access GitHub or other sites requiring auth.
- Update system prompt: require web search usage when needed and avoid assuming alternative access methods.
- Explore smarter agent architecture: spawn a sub-agent with a stronger model to complete tasks (similar to the Discord AI bot).
- Improve sandbox/tool UX context: show status updates for installing packages/restoring sandbox/execute/complete, and apply to other tools.
- Add a output truncation or something into the tool input so it doesnt get a huge blob of responses (refer http://github.com/techwithanirudh/discord-ai-bot)
- take a look at opencode, and it's tools https://github.com/anomalyco/opencode see what we wanna add to agent
- also make AI pass reason / text on what it's doing so we can show in sandbox
- like claude code store the turns in assistant/turns or whatever so it can see what output etc in json files