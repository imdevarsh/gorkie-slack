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
- add proper LOGs on tools input / output like previous iteration
- summary .at(-1) is not accurate? why does sb agent not pass the summary
- enforce AI to write in displayed and follow status... it never does that btw.... maybe just give an uploadFile tool check in stream and call slack api
- remove unused unwanted db fields
- Handle getResponse() returning undefined as an actual error
- Use typed ACP event schemas instead of manual casting in events.ts
- Fix updateStatus to not clear historical timestamps
- Delete unused getSandbox() and reconnectSandbox() exports
