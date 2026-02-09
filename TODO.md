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
