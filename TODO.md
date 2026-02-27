# TODO

- Audit security: authentication boundaries, data access, and tool permissions.
- Check With User DMs
- Fix ratelimiting
- fix lint
- TODO: Langfuse shows daytona tools run in sandbox tool? it is very cursed
- TODO: Test multiple prompt / queue
- TODO: Test if it self-timeouts without interaction
- TODO: re-eval pricing
- TODO: add observability and better logging sandbox
- add a path function to join paths rather than ${config.runtime.workdir}/xyz
- remove unused unwanted db fields
- Use typed ACP event schemas instead of manual casting in events.ts
- Status update logic is half broken; fix that and cleanup RPC code, support custom MCP integrations
- extend / bump timeouts tus: "is creating assets and rendering video"
- Sandbox run timeout captured in logs; move full payload to issue/runbook with redacted identifiers.
- Add clearer error messages, parse errors properly from pi
- Add model retry support
- Preconfigure playwright MCP (npm install -g agent-browser )
- Handle timeouts and retries per task command vs per global agent

Sandbox:
Give Gorkie Access to AgentMail.to (gorkie@agentmail.to)
Give Gorkei it's own Github Account
Give Gorkie persistant volumes
Preinstall remotion skill + to make videos
Pre-configure moltbook for FUN
Block Gorkie process inspection (ps -a)
Listen for webhooks for Agent Mail, and spawn Gorkie on email